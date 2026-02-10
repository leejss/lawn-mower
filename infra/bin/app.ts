#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { NewsPipelineStack } from "../lib/news-pipeline-stack";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") ?? "dev";
const githubOwner = app.node.tryGetContext("githubOwner") ?? "";
const githubRepo = app.node.tryGetContext("githubRepo") ?? "";
const githubBranch = app.node.tryGetContext("githubBranch") ?? "main";

new NewsPipelineStack(app, `NewsPipelineStack-${stage}`, {
  stage,
  githubOwner,
  githubRepo,
  githubBranch,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
