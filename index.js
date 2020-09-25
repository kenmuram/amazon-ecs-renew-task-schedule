const core = require('@actions/core');
const aws = require('aws-sdk');

const TASK_DEFINITION_ARN_PATTERN = /^arn:aws:ecs:(?<region>.+?):(?<account_id>[0-9]+?):task-definition\/(?<cluster>.+?):[0-9]+?$/
const MAX_LOOP = 10

async function run() {
    try {
        const updateTaskDefinitionArn = core.getInput('update-task-definition-arn', { required: true });
        const cluster = core.getInput('cluster', { required: false });

        const config = new aws.Config()
        const sts = new aws.STS({apiVersion: '2011-06-15'});
        const cloudWatchEvent = new aws.CloudWatchEvents({apiVersion: '2015-10-07'});

        const getCallerIdentityResponse = await sts.getCallerIdentity({}).promise();
        core.debug(getCallerIdentityResponse);

        for (let i = 0, nextToken = ""; i < MAX_LOOP; i++) {
            const parameter = {TargetArn: "arn:aws:ecs:" + config.region + ":" + getCallerIdentityResponse.Account + ":cluster/" + cluster}

            if (nextToken) {
                parameter["NextToken"] = nextToken
            }

            const listRuleNamesByTargetResponse = await cloudWatchEvent.listRuleNamesByTarget(parameter).promise();
            core.debug(listRuleNamesByTargetResponse);

            for (let i = 0; i < listRuleNamesByTargetResponse.RuleNames.length; i++) {
                const ruleName = listRuleNamesByTargetResponse.RuleNames[i]
                const listTargetsByRuleResponse = await cloudWatchEvent.listTargetsByRule({Rule: ruleName}).promise();
                core.debug(listTargetsByRuleResponse);

                const taskDefinitionArn = listTargetsByRuleResponse.Targets[0].EcsParameters.TaskDefinitionArn
                const taskDefinitionArnMatch = taskDefinitionArn.match(TASK_DEFINITION_ARN_PATTERN)
                const updateTaskDefinitionArnMatch = updateTaskDefinitionArn.match(TASK_DEFINITION_ARN_PATTERN)

                if (JSON.stringify(taskDefinitionArnMatch.groups) != JSON.stringify(updateTaskDefinitionArnMatch.groups)) {
                    continue;
                }

                const putTargetParameter = {Rule: ruleName, Targets: listTargetsByRuleResponse.Targets}
                putTargetParameter.Targets[0].EcsParameters.TaskDefinitionArn = updateTaskDefinitionArn

                const putTargetsResponse = await cloudWatchEvent.putTargets(putTargetParameter).promise();
                core.debug(putTargetsResponse);
            }

            nextToken = listRuleNamesByTargetResponse.NextToken

            if (!nextToken) {
                break;
            }
        }

    } catch (error) {
        core.debug(error);
    }
}

run();
