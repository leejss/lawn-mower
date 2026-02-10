import path from "node:path";
import {
	CfnOutput,
	Duration,
	RemovalPolicy,
	Stack,
	type StackProps,
} from "aws-cdk-lib";
import {
	AttributeType,
	BillingMode,
	StreamViewType,
	Table,
} from "aws-cdk-lib/aws-dynamodb";
import {
	Effect,
	FederatedPrincipal,
	OpenIdConnectProvider,
	PolicyStatement,
	Role,
} from "aws-cdk-lib/aws-iam";
import { Runtime, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { SqsDestination } from "aws-cdk-lib/aws-lambda-destinations";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Queue } from "aws-cdk-lib/aws-sqs";
import type { Construct } from "constructs";

export type NewsPipelineStackProps = StackProps & {
	stage: string;
	githubOwner: string;
	githubRepo: string;
	githubBranch: string;
};

export class NewsPipelineStack extends Stack {
	constructor(scope: Construct, id: string, props: NewsPipelineStackProps) {
		super(scope, id, props);

		const prefix = `naver-news-${props.stage}`;

		const rawNewsTable = new Table(this, "RawNewsTable", {
			tableName: `${prefix}-raw-news`,
			partitionKey: { name: "news_id", type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			stream: StreamViewType.NEW_IMAGE,
			timeToLiveAttribute: "expires_at",
			removalPolicy: RemovalPolicy.RETAIN,
		});

		const analysisTable = new Table(this, "AnalysisTable", {
			tableName: `${prefix}-news-analysis`,
			partitionKey: { name: "news_id", type: AttributeType.STRING },
			billingMode: BillingMode.PAY_PER_REQUEST,
			timeToLiveAttribute: "expires_at",
			removalPolicy: RemovalPolicy.RETAIN,
		});

		const analysisDlq = new Queue(this, "AnalysisDlq", {
			queueName: `${prefix}-analysis-dlq`,
			retentionPeriod: Duration.days(14),
		});

		const aiWorker = new NodejsFunction(this, "AiWorker", {
			functionName: `${prefix}-ai-worker`,
			runtime: Runtime.NODEJS_20_X,
			entry: path.join(__dirname, "..", "lambda", "ai-worker.ts"),
			handler: "handler",
			timeout: Duration.seconds(30),
			memorySize: 512,
			environment: {
				ANALYSIS_TABLE_NAME: analysisTable.tableName,
				RAW_NEWS_TABLE_NAME: rawNewsTable.tableName,
			},
			bundling: {
				target: "node20",
			},
		});

		rawNewsTable.grantStreamRead(aiWorker);
		rawNewsTable.grantReadWriteData(aiWorker);
		analysisTable.grantReadWriteData(aiWorker);

		aiWorker.addEventSourceMapping("RawNewsStreamMapping", {
			eventSourceArn: rawNewsTable.tableStreamArn,
			batchSize: 10,
			retryAttempts: 2,
			bisectBatchOnError: true,
			onFailure: new SqsDestination(analysisDlq),
			startingPosition: StartingPosition.LATEST,
		});

		if (props.githubOwner && props.githubRepo) {
			const oidcProvider = new OpenIdConnectProvider(
				this,
				"GithubOidcProvider",
				{
					url: "https://token.actions.githubusercontent.com",
					clientIds: ["sts.amazonaws.com"],
				},
			);

			const sub = `repo:${props.githubOwner}/${props.githubRepo}:ref:refs/heads/${props.githubBranch}`;
			const githubRole = new Role(this, "GithubActionsRole", {
				roleName: `${prefix}-github-actions-role`,
				assumedBy: new FederatedPrincipal(
					oidcProvider.openIdConnectProviderArn,
					{
						StringEquals: {
							"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
							"token.actions.githubusercontent.com:sub": sub,
						},
					},
					"sts:AssumeRoleWithWebIdentity",
				),
			});

			githubRole.addToPolicy(
				new PolicyStatement({
					effect: Effect.ALLOW,
					actions: [
						"dynamodb:PutItem",
						"dynamodb:UpdateItem",
						"dynamodb:BatchWriteItem",
					],
					resources: [rawNewsTable.tableArn],
				}),
			);

			new CfnOutput(this, "GithubActionsRoleArn", {
				value: githubRole.roleArn,
			});
		}

		new CfnOutput(this, "RawNewsTableName", { value: rawNewsTable.tableName });
		new CfnOutput(this, "AnalysisTableName", {
			value: analysisTable.tableName,
		});
		new CfnOutput(this, "AnalysisDlqUrl", { value: analysisDlq.queueUrl });
	}
}
