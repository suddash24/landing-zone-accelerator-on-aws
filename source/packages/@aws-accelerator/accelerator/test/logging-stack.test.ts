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

import { AcceleratorStage } from '../lib/accelerator-stage';
import { describe } from '@jest/globals';
import { snapShotTest } from './snapshot-test';
import * as cdk from 'aws-cdk-lib';
import { Match, Create } from './accelerator-test-helpers';

const testNamePrefix = 'Construct(LoggingStack): ';

describe('LoggingStack', () => {
  snapShotTest(testNamePrefix, Create.stackProvider(`LogArchive-us-east-1`, AcceleratorStage.LOGGING));
});

describe('LoggingStackOuTargets', () => {
  snapShotTest(
    'Construct(LoggingStackOuTargets): ',
    Create.stackProvider(`LogArchive-us-east-1`, [
      AcceleratorStage.LOGGING,
      'aws',
      'us-east-1',
      'all-enabled-ou-targets',
    ]),
  );
});

describe('LoggingStack', () => {
  snapShotTest(
    testNamePrefix,
    Create.stackProvider(`LogArchive-us-west-2`, [AcceleratorStage.LOGGING, 'aws', 'us-west-2']),
  );
});

describe('LoggingStack with Firehose fileExtension', () => {
  let acceleratorTestStacks: AcceleratorSynthStacks;
  let stack: cdk.Stack;

  beforeEach(() => {
    acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.LOGGING, 'aws', 'us-east-1');
    stack = acceleratorTestStacks.stacks.get(`LogArchive-us-east-1`)!;
  });

  test('Firehose configuration includes fileExtension', () => {
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::KinesisFirehose::DeliveryStream', 1);

    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
      ExtendedS3DestinationConfiguration: {
        FileExtension: '.gzip',
        ProcessingConfiguration: {
          Enabled: true,
          Processors: [
            {
              Type: 'Lambda',
              Parameters: Match.arrayWith([
                {
                  ParameterName: 'LambdaArn',
                  ParameterValue: Match.anyValue(),
                },
              ]),
            },
          ],
        },
      },
    });
  });

  test('S3 bucket is configured to receive Firehose logs', () => {
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    });
  });
});

describe('LoggingStack with Firehose fileExtension', () => {
  let acceleratorTestStacks: AcceleratorSynthStacks;
  let stack: cdk.Stack;

  beforeEach(() => {
    acceleratorTestStacks = new AcceleratorSynthStacks(AcceleratorStage.LOGGING, 'aws', 'us-east-1');
    stack = acceleratorTestStacks.stacks.get(`LogArchive-us-east-1`)!;
  });

  test('Firehose configuration includes fileExtension', () => {
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::KinesisFirehose::DeliveryStream', 1);

    template.hasResourceProperties('AWS::KinesisFirehose::DeliveryStream', {
      ExtendedS3DestinationConfiguration: {
        FileExtension: '.gzip',
        ProcessingConfiguration: {
          Enabled: true,
          Processors: [
            {
              Type: 'Lambda',
              Parameters: Match.arrayWith([
                {
                  ParameterName: 'LambdaArn',
                  ParameterValue: Match.anyValue(),
                },
              ]),
            },
          ],
        },
      },
    });
  });

  test('S3 bucket is configured to receive Firehose logs', () => {
    const template = Template.fromStack(stack);

    template.hasResourceProperties('AWS::S3::Bucket', {
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    });
  });
});
