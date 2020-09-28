const core = require('@actions/core');
const aws = require('aws-sdk');

const TASK_DEFINITION_ARN_PATTERN = /^arn:aws:ecs:(?<region>.+?):(?<account_id>[0-9]+?):task-definition\/(?<task_definition_name>.+?):[0-9]+?$/
const LIST_RULE_NAMES_BY_TARGET_API_MAX_LOOP = 10
const FIRST = 0

async function run() {
    try {
        const config = new aws.Config()
        const sts = new aws.STS({apiVersion: '2011-06-15'});
        const cloudWatchEvent = new aws.CloudWatchEvents({apiVersion: '2015-10-07'});

        // get input
        const updateTaskDefinitionArn = core.getInput('update-task-definition-arn', { required: true });
        const cluster = core.getInput('cluster', { required: false });

        // get AccountID
        const getCallerIdentityResponse = await sts.getCallerIdentity({}).promise();
        core.debug('getCallerIdentityResponse - ' + JSON.stringify(getCallerIdentityResponse));

        for (let i = 0, nextToken = ""; i < LIST_RULE_NAMES_BY_TARGET_API_MAX_LOOP; i++) {
            // get ECS Task Schedule(CloudWatchEvent Rule) list
            const listRuleNamesByTargetParameter = {TargetArn: "arn:aws:ecs:" + config.region + ":" + getCallerIdentityResponse.Account + ":cluster/" + cluster}

            if (nextToken) {
                listRuleNamesByTargetParameter["NextToken"] = nextToken
            }

            core.debug('listRuleNamesByTargetParameter - ' + JSON.stringify(listRuleNamesByTargetParameter));
            const listRuleNamesByTargetResponse = await cloudWatchEvent.listRuleNamesByTarget(listRuleNamesByTargetParameter).promise();
            core.debug('listRuleNamesByTargetResponse - ' + JSON.stringify(listRuleNamesByTargetResponse));

            for (let i = 0; i < listRuleNamesByTargetResponse.RuleNames.length; i++) {
                // get ECS Task Schedule(CloudWatchEvent Rule) detail
                const listTargetsByRuleParameter ={
                    Rule: listRuleNamesByTargetResponse.RuleNames[i]
                }

                core.debug('listTargetsByRuleParameter - ' + JSON.stringify(listTargetsByRuleParameter));
                const listTargetsByRuleResponse = await cloudWatchEvent.listTargetsByRule(listTargetsByRuleParameter).promise();
                core.debug('listTargetsByRuleResponse - ' + JSON.stringify(listTargetsByRuleResponse));

                // update Task Definition Arn for ECS Task Schedule(CloudWatchEvent Rule)
                const currentTaskDefinitionArn = listTargetsByRuleResponse.Targets[0].EcsParameters.TaskDefinitionArn
                const currentTaskDefinitionArnMatch = currentTaskDefinitionArn.match(TASK_DEFINITION_ARN_PATTERN)
                const updateTaskDefinitionArnMatch = updateTaskDefinitionArn.match(TASK_DEFINITION_ARN_PATTERN)

                if (JSON.stringify(currentTaskDefinitionArnMatch.groups) != JSON.stringify(updateTaskDefinitionArnMatch.groups)) {
                    // skip not equal task definition name
                    continue;
                }

                const putTargetParameter = {
                    Rule: listRuleNamesByTargetResponse.RuleNames[i],
                    Targets: listTargetsByRuleResponse.Targets
                }

                putTargetParameter.Targets[FIRST].EcsParameters.TaskDefinitionArn = updateTaskDefinitionArn

                core.debug('putTargetParameter - ' + JSON.stringify(putTargetParameter));
                const putTargetsResponse = await cloudWatchEvent.putTargets(putTargetParameter).promise();
                core.debug('putTargetsResponse - ' + JSON.stringify(putTargetsResponse));

                if (putTargetsResponse.FailedEntries.length > 0) {
                    const error_messages = putTargetsResponse.FailedEntries.map(failedEntry => failedEntry.ErrorMessage);
                    throw new Error(error_messages.join("\n"));
                }
            }

            nextToken = listRuleNamesByTargetResponse.NextToken

            if (!nextToken) {
                break;
            }
        }

    } catch (error) {
        core.setFailed(error.message);
        core.debug(error.stack);
    }
}

run();
