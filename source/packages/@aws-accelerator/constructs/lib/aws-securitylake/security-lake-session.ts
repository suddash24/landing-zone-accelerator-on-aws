/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface SecurityLakeProps {
  readonly securityLakeRoleArn: string;
  readonly adminAccountId: string;
  readonly regions: string[];
  readonly rollupRegions: string[];
  readonly accounts: string[];
}

export class SecurityLakeSession extends Construct {
  props: SecurityLakeProps;
  constructor(scope: Construct, id: string, props: SecurityLakeProps) {
    super(scope, id);
    this.props = props;

    // const delegatedAdminAccount = "Audit";
    // const securityLakeAdminAccountId = props.accountsConfig.getAccountId(delegatedAdminAccount);
    // this.enableIdentityCenterDelegatedAdminAccount(securityLakeAdminAccountId);

    const securityLakeKey = new cdk.aws_kms.Key(this, 'SecurityLakeKey', {
      enableKeyRotation: true,
      description: 'KMS key for Security Lake encryption',
      alias: 'security-lake-key',
    });

    const lifecycleRule: cdk.aws_securitylake.CfnDataLake.LifecycleConfigurationProperty = {
      transitions: [
        {
          storageClass: 'GLACIER',
          days: 90,
        },
      ],
      expiration: {
        days: 365,
      },
    };

    const datalake = new cdk.aws_securitylake.CfnDataLake(this, 'MyCfnDataLake', {
      encryptionConfiguration: {
        kmsKeyId: securityLakeKey.keyId,
      },
      lifecycleConfiguration: lifecycleRule,
      replicationConfiguration: {
        regions: props.rollupRegions,
        roleArn: props.securityLakeRoleArn, // This parameter uses the IAM role created that is managed by Security Lake, to ensure the replication setting is correct.
      },
    });

    this.createAwsLogSources(['ROUTE53', 'SH_FINDINGS', 'S3_DATA'], datalake.attrArn, props.accounts);

    //   new cdk.aws_securitylake.CfnSubscriber(this, 'MyCfnSubscriber', {
    //     accessTypes: ['S3'],
    //     dataLakeArn: 'dataLakeArn',
    //     sources: [{
    //       awsLogSource: {
    //       sourceName: 'ROUTE53',
    //       sourceVersion: '2.0',
    //     },
    //     customLogSource: {
    //       sourceName: 'sourceName',
    //       sourceVersion: 'sourceVersion',
    //     },
    //     }],
    //     subscriberIdentity: {
    //       externalId: 'externalId',
    //       principal: 'principal',
    //     },
    //     subscriberName: 'subscriberName',

    //     subscriberDescription: 'subscriberDescription',
    //     tags: [{
    //       key: 'key',
    //       value: 'value',
    //     }],
    //   });
  }

  createAwsLogSources(sources: string[], dataLakeArn: string, accounts: string[]) {
    const logsources: cdk.aws_securitylake.CfnAwsLogSource[] = [];
    for (const source of sources) {
      const logsource = new cdk.aws_securitylake.CfnAwsLogSource(this, 'MyCfnAwsLogSource', {
        dataLakeArn: dataLakeArn,
        sourceName: source,
        sourceVersion: '2.0',
        accounts: accounts, // How to define all accounts in LZA
      });
      logsources.push(logsource);
    }
    return logsources;
  }
}
