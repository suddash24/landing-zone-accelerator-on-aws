/**
 *  Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

import { AseaResourceMapping, GlobalConfig } from '@aws-accelerator/config';
import { createLogger } from '@aws-accelerator/utils';
import * as cdk from 'aws-cdk-lib';
import { AwsSolutionsChecks, NagSuppressions } from 'cdk-nag';
import { IConstruct } from 'constructs';
import { version } from '../../../../package.json';
import { AcceleratorStackNames } from '../lib/accelerator';
import { AcceleratorStage } from '../lib/accelerator-stage';
import { AcceleratorStackProps } from '../lib/stacks/accelerator-stack';
import { AccountsStack } from '../lib/stacks/accounts-stack';
import { ApplicationsStack } from '../lib/stacks/applications-stack';
import { BootstrapStack } from '../lib/stacks/bootstrap-stack';
import { CustomStack, customStackMapping, generateCustomStackMappings, isIncluded } from '../lib/stacks/custom-stack';
import { CustomizationsStack } from '../lib/stacks/customizations-stack';
import { DependenciesStack } from '../lib/stacks/dependencies-stack/dependencies-stack';
import { FinalizeStack } from '../lib/stacks/finalize-stack';
import { KeyStack } from '../lib/stacks/key-stack';
import { LoggingStack } from '../lib/stacks/logging-stack';
import { NetworkAssociationsGwlbStack } from '../lib/stacks/network-stacks/network-associations-gwlb-stack/network-associations-gwlb-stack';
import { NetworkAssociationsStack } from '../lib/stacks/network-stacks/network-associations-stack/network-associations-stack';
import { NetworkPrepStack } from '../lib/stacks/network-stacks/network-prep-stack/network-prep-stack';
import { NetworkVpcDnsStack } from '../lib/stacks/network-stacks/network-vpc-dns-stack/network-vpc-dns-stack';
import { NetworkVpcEndpointsStack } from '../lib/stacks/network-stacks/network-vpc-endpoints-stack/network-vpc-endpoints-stack';
import { NetworkVpcStack } from '../lib/stacks/network-stacks/network-vpc-stack/network-vpc-stack';
import { OperationsStack } from '../lib/stacks/operations-stack';
import { OrganizationsStack } from '../lib/stacks/organizations-stack';
import { PipelineStack } from '../lib/stacks/pipeline-stack';
import { PrepareStack } from '../lib/stacks/prepare-stack';
import { SecurityAuditStack } from '../lib/stacks/security-audit-stack';
import { SecurityResourcesStack } from '../lib/stacks/security-resources-stack';
import { SecurityStack } from '../lib/stacks/security-stack';
import { TesterPipelineStack } from '../lib/stacks/tester-pipeline-stack';
import { AcceleratorContext, AcceleratorEnvironment, AcceleratorResourcePrefixes } from './app-utils';
import { ImportAseaResourcesStack } from '../lib/stacks/import-asea-resources-stack';

const logger = createLogger(['stack-utils']);

/**
 * This function returns a CDK stack synthesizer based on configuration options
 * @param props
 * @param accountId
 * @param region
 * @returns
 */
function getStackSynthesizer(
  props: AcceleratorStackProps,
  accountId: string,
  region: string,
  stage: string | undefined = undefined,
) {
  const customDeploymentRole = props.globalConfig.cdkOptions?.customDeploymentRole;
  const managementAccountId = props.accountsConfig.getManagementAccountId();
  const centralizeBuckets =
    props.globalConfig.centralizeCdkBuckets?.enable || props.globalConfig.cdkOptions?.centralizeBuckets;
  const fileAssetBucketName = centralizeBuckets ? `cdk-accel-assets-${managementAccountId}-${region}` : undefined;
  const bucketPrefix = centralizeBuckets ? `${accountId}/` : undefined;
  if (customDeploymentRole && !isBeforeBootstrapStage(stage)) {
    logger.info(
      `Stack in account ${accountId} and region ${region} using Custom deployment role ${customDeploymentRole}`,
    );
    const customDeploymentRoleArn = `arn:${props.partition}:iam::${accountId}:role/${customDeploymentRole}`;

    return new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
      bucketPrefix: bucketPrefix,
      fileAssetsBucketName: fileAssetBucketName,
      cloudFormationExecutionRole: customDeploymentRoleArn,
      deployRoleArn: customDeploymentRoleArn,
      fileAssetPublishingRoleArn: customDeploymentRoleArn,
      lookupRoleArn: customDeploymentRoleArn,
      imageAssetPublishingRoleArn: customDeploymentRoleArn,
    });
  }
  if (props.globalConfig.cdkOptions?.useManagementAccessRole) {
    logger.info(`Stack in account ${accountId} and region ${region} using CliCredentialSynthesizer`);
    return new cdk.CliCredentialsStackSynthesizer({
      bucketPrefix: bucketPrefix,
      fileAssetsBucketName: fileAssetBucketName,
    });
  } else {
    logger.info(`Stack in account ${accountId} and region ${region} using DefaultSynthesizer`);
    return new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
      bucketPrefix: bucketPrefix,
      fileAssetsBucketName: fileAssetBucketName,
    });
  }
}

/**
 * This function returns a CDK stack synthesizer based on configuration options
 * @param props
 * @param accountId
 * @param region
 * @param bootstrapAccountId
 * @param qualifier
 * @param roleName
 * @returns
 */
function getAseaStackSynthesizer(props: {
  accelProps: AcceleratorStackProps;
  accountId: string;
  region: string;
  qualifier?: string;
  roleName?: string;
}) {
  const { accountId, region, qualifier, roleName, accelProps } = props;
  const managementAccountId = accelProps.accountsConfig.getManagementAccountId();
  const centralizeBuckets =
    accelProps.globalConfig.centralizeCdkBuckets?.enable || accelProps.globalConfig.cdkOptions?.centralizeBuckets;
  const fileAssetsBucketName = centralizeBuckets ? `cdk-accel-assets-${managementAccountId}-${region}` : undefined;
  const bucketPrefix = `${accountId}/`;

  if (accelProps.globalConfig.cdkOptions?.useManagementAccessRole) {
    logger.info(`Stack in account ${accountId} and region ${region} using CliCredentialSynthesizer`);
    return new cdk.CliCredentialsStackSynthesizer({
      bucketPrefix,
      fileAssetsBucketName,
      qualifier,
    });
  } else {
    logger.info(`Stack in account ${accountId} and region ${region} using DefaultSynthesizer`, roleName);
    const executionRoleArn = `arn:aws:iam::${accountId}:role/${roleName!}`;
    return new cdk.DefaultStackSynthesizer({
      generateBootstrapVersionRule: false,
      bucketPrefix,
      fileAssetsBucketName,
      qualifier,
      cloudFormationExecutionRole: executionRoleArn,
      deployRoleArn: executionRoleArn,
      fileAssetPublishingRoleArn: executionRoleArn,
      imageAssetPublishingRoleArn: executionRoleArn,
    });
  }
}

/**
 * This function is required rather than using an Aspect class for two reasons:
 * 1. Some resources do not support tag updates
 * 2. Using Aspects for stacks that use the fs.writeFileSync() operation
 * causes the application to quit during stack synthesis
 * @param node
 * @param partition
 * @param globalConfig
 * @param acceleratorPrefix
 */
function addAcceleratorTags(
  node: IConstruct,
  partition: string,
  globalConfig: GlobalConfig,
  acceleratorPrefix: string,
): void {
  // Resource types that do not support tag updates
  const excludeResourceTypes = [
    'AWS::EC2::TransitGatewayRouteTable',
    'AWS::Route53Resolver::FirewallDomainList',
    'AWS::Route53Resolver::ResolverEndpoint',
    'AWS::Route53Resolver::ResolverRule',
  ];

  for (const resource of node.node.findAll()) {
    if (resource instanceof cdk.CfnResource && !excludeResourceTypes.includes(resource.cfnResourceType)) {
      if (resource instanceof cdk.aws_ec2.CfnTransitGateway && partition !== 'aws') {
        continue;
      }
      new cdk.Tag('Accel-P', acceleratorPrefix).visit(resource);
      new cdk.Tag('Accelerator', acceleratorPrefix).visit(resource);

      if (globalConfig?.tags) {
        globalConfig.tags.forEach(t => {
          new cdk.Tag(t.key, t.value).visit(resource);
        });
      }
    }
  }
}

/**
 * Compares app context with stack environment and returns a boolean value
 * based on whether or not a given stack should be synthesized
 * @param context
 * @param props
 * @returns
 */
function includeStage(
  context: AcceleratorContext,
  props: { stage: string; account?: string; region?: string },
): boolean {
  if (!context.stage) {
    // Do not include PIPELINE or TESTER_PIPELINE in full synth/diff
    if (['pipeline', 'tester-pipeline'].includes(props.stage)) {
      return false;
    }
    return true; // No stage, return all other stacks
  }
  if (context.stage === props.stage) {
    if (!context.account && !context.region) {
      return true; // No account or region, return all stacks for synth/diff
    }
    if (props.account === context.account && props.region === context.region) {
      return true;
    }
  }
  return false;
}

/**
 * Create Pipeline Stack
 * @param app
 * @param context
 * @param acceleratorEnv
 * @param resourcePrefixes
 */
export function createPipelineStack(
  app: cdk.App,
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  resourcePrefixes: AcceleratorResourcePrefixes,
  enableAseaMigration: boolean,
) {
  if (includeStage(context, { stage: AcceleratorStage.PIPELINE, account: context.account, region: context.region })) {
    const pipelineStack = new PipelineStack(
      app,
      acceleratorEnv.qualifier
        ? `${acceleratorEnv.qualifier}-${AcceleratorStage.PIPELINE}-stack-${context.account}-${context.region}`
        : `${AcceleratorStackNames[AcceleratorStage.PIPELINE]}-${context.account}-${context.region}`,
      {
        env: { account: context.account, region: context.region },
        description: `(SO0199-pipeline) Landing Zone Accelerator on AWS. Version ${version}.`,
        terminationProtection: true,
        partition: context.partition,
        prefixes: resourcePrefixes,
        enableAseaMigration,
        ...acceleratorEnv,
      },
    );
    cdk.Aspects.of(pipelineStack).add(new AwsSolutionsChecks());

    NagSuppressions.addStackSuppressions(pipelineStack, [
      {
        id: 'AwsSolutions-IAM5',
        reason: 'IAM role requires wildcard permissions.',
      },
    ]);
  }
}

/**
 * Create Tester Pipeline Stack
 * @param app
 * @param context
 * @param acceleratorEnv
 * @param resourcePrefixes
 */
export function createTesterStack(
  app: cdk.App,
  context: AcceleratorContext,
  acceleratorEnv: AcceleratorEnvironment,
  resourcePrefixes: AcceleratorResourcePrefixes,
) {
  if (
    includeStage(context, { stage: AcceleratorStage.TESTER_PIPELINE, account: context.account, region: context.region })
  ) {
    if (acceleratorEnv.managementCrossAccountRoleName) {
      const testerPipelineStack = new TesterPipelineStack(
        app,
        acceleratorEnv.qualifier
          ? `${acceleratorEnv.qualifier}-${AcceleratorStage.TESTER_PIPELINE}-stack-${context.account}-${context.region}`
          : `${AcceleratorStackNames[AcceleratorStage.TESTER_PIPELINE]}-${context.account}-${context.region}`,
        {
          env: { account: context.account, region: context.region },
          description: `(SO0199-tester) Landing Zone Accelerator on AWS. Version ${version}.`,
          terminationProtection: true,
          prefixes: resourcePrefixes,
          managementCrossAccountRoleName: acceleratorEnv.managementCrossAccountRoleName,
          ...acceleratorEnv,
        },
      );
      cdk.Aspects.of(testerPipelineStack).add(new AwsSolutionsChecks());
    }
  }
}

/**
 * Create Prepare Stack
 * @param app
 * @param context
 * @param props
 * @param managementAccountId
 * @param homeRegion
 */
export function createPrepareStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  homeRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.PREPARE,
      account: managementAccountId,
      region: homeRegion,
    })
  ) {
    const prepareStack = new PrepareStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.PREPARE]}-${managementAccountId}-${homeRegion}`,
      {
        env: {
          account: managementAccountId,
          region: homeRegion,
        },
        description: `(SO0199-prepare) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, managementAccountId, homeRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(prepareStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(prepareStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Finalize Stack
 * @param app
 * @param context
 * @param props
 * @param managementAccountId
 * @param globalRegion
 */
export function createFinalizeStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  globalRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.FINALIZE,
      account: managementAccountId,
      region: globalRegion,
    })
  ) {
    const finalizeStack = new FinalizeStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.FINALIZE]}-${managementAccountId}-${globalRegion}`,
      {
        env: {
          account: managementAccountId,
          region: globalRegion,
        },
        description: `(SO0199-finalize) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, managementAccountId, globalRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(finalizeStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(finalizeStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Accounts Stack
 * @param app
 * @param context
 * @param props
 * @param managementAccountId
 * @param globalRegion
 */
export function createAccountsStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  globalRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.ACCOUNTS,
      account: managementAccountId,
      region: globalRegion,
    })
  ) {
    const accountsStack = new AccountsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.ACCOUNTS]}-${managementAccountId}-${globalRegion}`,
      {
        env: {
          account: managementAccountId,
          region: globalRegion,
        },
        description: `(SO0199-accounts) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, managementAccountId, globalRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(accountsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(accountsStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Organizations Stack
 * @param app
 * @param context
 * @param props
 * @param managementAccountId
 * @param enabledRegion
 */
export function createOrganizationsStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  managementAccountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.ORGANIZATIONS,
      account: managementAccountId,
      region: enabledRegion,
    })
  ) {
    const organizationStack = new OrganizationsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.ORGANIZATIONS]}-${managementAccountId}-${enabledRegion}`,
      {
        env: {
          account: managementAccountId,
          region: enabledRegion,
        },
        description: `(SO0199-organizations) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, managementAccountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(organizationStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(organizationStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Security Audit Stack
 * @param app
 * @param context
 * @param props
 * @param auditAccountId
 * @param enabledRegion
 */
export function createSecurityAuditStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  auditAccountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.SECURITY_AUDIT,
      account: auditAccountId,
      region: enabledRegion,
    })
  ) {
    const auditStack = new SecurityAuditStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.SECURITY_AUDIT]}-${auditAccountId}-${enabledRegion}`,
      {
        env: {
          account: auditAccountId,
          region: enabledRegion,
        },
        description: `(SO0199-securityaudit) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, auditAccountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(auditStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(auditStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Creates the Key and Dependencies Stacks
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createKeyDependencyStacks(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.KEY,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const keyStack = new KeyStack(app, `${AcceleratorStackNames[AcceleratorStage.KEY]}-${accountId}-${enabledRegion}`, {
      env,
      description: `(SO0199-key) Landing Zone Accelerator on AWS. Version ${version}.`,
      synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
      terminationProtection: props.globalConfig.terminationProtection ?? true,
      ...props,
    });
    addAcceleratorTags(keyStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(keyStack).add(new AwsSolutionsChecks());

    const dependencyStack = new DependenciesStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.DEPENDENCIES]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-dependencies) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(dependencyStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(dependencyStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Bootstrap Stack
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createBootstrapStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.BOOTSTRAP,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const bootstrapStack = new BootstrapStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.BOOTSTRAP]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-bootstrap) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(bootstrapStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(bootstrapStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Logging Stack
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createLoggingStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.LOGGING,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const loggingStack = new LoggingStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.LOGGING]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-logging) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(loggingStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(loggingStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Security Stack
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createSecurityStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.SECURITY,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const securityStack = new SecurityStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.SECURITY]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-security) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(securityStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(securityStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Operations Stack
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 * @param accountWarming
 */
export function createOperationsStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
  accountWarming: boolean,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.OPERATIONS,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const operationsStack = new OperationsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.OPERATIONS]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-operations) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
        accountWarming,
      },
    );
    addAcceleratorTags(operationsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(operationsStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Network Prep Stack
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createNetworkPrepStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.NETWORK_PREP,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const networkPrepStack = new NetworkPrepStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_PREP]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkprep) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(networkPrepStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(networkPrepStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create Security Resources Stack
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createSecurityResourcesStack(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.SECURITY_RESOURCES,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const securityResourcesStack = new SecurityResourcesStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.SECURITY_RESOURCES]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-securityresources) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(securityResourcesStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(securityResourcesStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create all Network VPC stage stacks
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createNetworkVpcStacks(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.NETWORK_VPC,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const vpcStack = new NetworkVpcStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkvpc) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(vpcStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(vpcStack).add(new AwsSolutionsChecks());

    const endpointsStack = new NetworkVpcEndpointsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_ENDPOINTS]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkendpoints) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(endpointsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    endpointsStack.addDependency(vpcStack);
    cdk.Aspects.of(endpointsStack).add(new AwsSolutionsChecks());

    const dnsStack = new NetworkVpcDnsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_VPC_DNS]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkdns) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(dnsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    dnsStack.addDependency(endpointsStack);
    cdk.Aspects.of(dnsStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create all Network Associations stage stacks
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createNetworkAssociationsStacks(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.NETWORK_ASSOCIATIONS,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const networkAssociationsStack = new NetworkAssociationsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkassociations) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(networkAssociationsStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(networkAssociationsStack).add(new AwsSolutionsChecks());

    const networkGwlbStack = new NetworkAssociationsGwlbStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.NETWORK_ASSOCIATIONS_GWLB]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-networkgwlb) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    addAcceleratorTags(networkGwlbStack, context.partition, props.globalConfig, props.prefixes.accelerator);
    cdk.Aspects.of(networkGwlbStack).add(new AwsSolutionsChecks());
  }
}

/**
 * Create all Customizations stage stacks
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
export function createCustomizationsStacks(
  app: cdk.App,
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (
    includeStage(context, {
      stage: AcceleratorStage.CUSTOMIZATIONS,
      account: accountId,
      region: enabledRegion,
    })
  ) {
    const customizationsStack = new CustomizationsStack(
      app,
      `${AcceleratorStackNames[AcceleratorStage.CUSTOMIZATIONS]}-${accountId}-${enabledRegion}`,
      {
        env,
        description: `(SO0199-customizations) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion, context.stage),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
      },
    );
    cdk.Aspects.of(customizationsStack).add(new AwsSolutionsChecks());

    createCustomStacks(app, props, env, accountId, enabledRegion);

    createApplicationsStacks(app, props, env, accountId, enabledRegion);
  }
}

/**
 * Import ASEA CloudFormation stacks manage resources using LZA CDK App
 * @param app
 * @param context
 * @param props
 * @param accountId
 * @param enabledRegion
 * @returns
 */
export function importAseaResourceStacks(
  rootApp: cdk.App,
  rootContext: AcceleratorContext,
  props: AcceleratorStackProps,
  accountId: string,
  enabledRegion: string,
) {
  if (
    (!includeStage(rootContext, {
      stage: AcceleratorStage.IMPORT_ASEA_RESOURCES,
      account: accountId,
      region: enabledRegion,
    }) &&
      !includeStage(rootContext, {
        stage: AcceleratorStage.POST_IMPORT_ASEA_RESOURCES,
        account: accountId,
        region: enabledRegion,
      })) ||
    !props.globalConfig.externalLandingZoneResources?.importExternalLandingZoneResources
  ) {
    return;
  }
  // Since we use different apps and stacks are not part of rootApp, adding empty stack
  // to app to avoid command failure for no stacks in app
  if (!rootApp.node.tryFindChild(`placeHolder`)) {
    new cdk.Stack(rootApp, `placeHolder`, {});
  }
  const aseaStackMap = props.globalConfig.externalLandingZoneResources?.templateMap;
  const acceleratorPrefix = props.globalConfig.externalLandingZoneResources?.acceleratorPrefix;

  if (!aseaStackMap) {
    logger.error(`Could not load asea mapping file from externalLandingZoneResources in global config`);
    throw new Error(`Configuration validation failed at runtime.`);
  }

  if (!acceleratorPrefix) {
    logger.error(`Could not load accelerator prefix from externalLandingZoneResources in global config`);
    throw new Error(`Configuration validation failed at runtime.`);
  }
  /**
   * Create one cdk.App for each account and region to avoid name conflicts
   * Couldn't use cdk.Stage because of NestedStack naming
   * CfnInclude.loadNestedStack prefixes stage name to existing stack name.
   */
  const app = new cdk.App({
    outdir: `cdk.out/phase-${accountId}-${enabledRegion}`,
  });

  const resourceMapping: AseaResourceMapping[] = [];

  for (const phase of [-1, 0, 1, 2, 3, 4, 5]) {
    const aseaStacks = aseaStackMap.filter(
      stack => stack.accountId === accountId && stack.region === enabledRegion && stack.phase === phase,
    );
    if (aseaStacks.length === 0) {
      logger.warn(`No ASEA stack found for account ${accountId} in region ${enabledRegion} for ${phase.toString()}`);
      continue;
    }
    const synthesizer = getAseaStackSynthesizer({
      accelProps: props,
      accountId,
      region: enabledRegion,
      roleName: `${acceleratorPrefix}PipelineRole`,
    });

    for (const aseaStack of aseaStacks.filter(stack => !stack.nestedStack)) {
      const { resourceMapping: stackResourceMapping } = new ImportAseaResourcesStack(app, aseaStack.stackName, {
        ...props,
        stackName: aseaStack.stackName,
        synthesizer,
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        stackInfo: aseaStack,
        nestedStacks: aseaStacks.filter(
          stack => stack.nestedStack && stack.accountId === aseaStack.accountId && stack.region === aseaStack.region,
        ),
        env: {
          account: accountId,
          region: enabledRegion,
        },
        stage: rootContext.stage! as
          | AcceleratorStage.IMPORT_ASEA_RESOURCES
          | AcceleratorStage.POST_IMPORT_ASEA_RESOURCES,
      });
      resourceMapping.push(...stackResourceMapping);
    }
  }
  return resourceMapping;
}

/**
 * Saves Consolidated ASEA Resources from resource mapping
 * @param context
 * @param props
 * @param resources
 */
export function saveAseaResourceMapping(
  context: AcceleratorContext,
  props: AcceleratorStackProps,
  resources: AseaResourceMapping[],
) {
  if (context.stage && context.stage === AcceleratorStage.IMPORT_ASEA_RESOURCES) {
    props.globalConfig.saveAseaResourceMapping(resources);
  }
}

/**
 * Create custom CloudFormation stacks
 * @param app
 * @param context
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
function createCustomStacks(
  app: cdk.App,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  if (props.customizationsConfig?.customizations?.cloudFormationStacks) {
    const customStackList = generateCustomStackMappings(
      props.accountsConfig,
      props.organizationConfig,
      props.customizationsConfig,
      accountId,
      enabledRegion,
    );

    for (const stack of customStackList ?? []) {
      logger.info(`New custom stack ${stack.stackConfig.name}`);
      stack.stackObj = new CustomStack(app, `${stack.stackConfig.name}-${accountId}-${enabledRegion}`, {
        env,
        description: stack.stackConfig.description,
        runOrder: stack.stackConfig.runOrder,
        stackName: stack.stackConfig.name,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion),
        templateFile: stack.stackConfig.template,
        terminationProtection: stack.stackConfig.terminationProtection,
        parameters: stack.stackConfig.parameters,
        ssmParamNamePrefix: props.prefixes.ssmParamName,
        ...props,
      });
      // Create stack dependencies as needed
      addCustomStackDependencies(stack, stack.stackObj, customStackList);
    }
  }
}

/**
 * Add dependencies to custom stack
 * @param stack
 * @param customStack
 * @param customStackList
 */
function addCustomStackDependencies(
  stack: customStackMapping,
  customStack: cdk.Stack,
  customStackList: customStackMapping[],
) {
  for (const stackName of stack.dependsOn ?? []) {
    const previousStack = customStackList.find(a => a.stackConfig.name == stackName)?.stackObj;
    if (previousStack) {
      customStack.addDependency(previousStack);
    }
  }
}

/**
 * Create custom applications stacks
 * @param app
 * @param props
 * @param env
 * @param accountId
 * @param enabledRegion
 */
function createApplicationsStacks(
  app: cdk.App,
  props: AcceleratorStackProps,
  env: cdk.Environment,
  accountId: string,
  enabledRegion: string,
) {
  for (const application of props.customizationsConfig.applications ?? []) {
    if (
      isIncluded(
        application.deploymentTargets,
        enabledRegion,
        accountId,
        props.accountsConfig,
        props.organizationConfig,
      )
    ) {
      const applicationStackName = `${props.prefixes.accelerator}-App-${application.name}-${accountId}-${enabledRegion}`;

      const applicationStack = new ApplicationsStack(app, applicationStackName, {
        env,
        description: `(SO0199-customizations) Landing Zone Accelerator on AWS. Version ${version}.`,
        synthesizer: getStackSynthesizer(props, accountId, enabledRegion),
        terminationProtection: props.globalConfig.terminationProtection ?? true,
        ...props,
        appConfigItem: application,
      });
      cdk.Aspects.of(applicationStack).add(new AwsSolutionsChecks());
    }
  }
}

function isBeforeBootstrapStage(stage?: string): boolean {
  const preBootstrapStages = [
    AcceleratorStage.PREPARE,
    AcceleratorStage.ACCOUNTS,
    AcceleratorStage.BOOTSTRAP,
  ] as string[];
  if (!stage) {
    return false;
  }

  return preBootstrapStages.includes(stage);
}
