/**
 * Tests functions exported from ./index.js.
 *
 * @author Tim Malone <tdmalone@gmail.com>
 */

/* global expect */

'use strict';

const index = require( '../' );

test( 'SNS topic ARN gets shortened correctly', () => {
  const sampleArn = 'arn:aws:sns:ap-southeast-2:873114526714:codebuild-notifications';
  expect( index.getNameFromArn( sampleArn ) ).toBe( 'codebuild-notifications' );
});

test( 'A failed build gets a danger colour for Slack', () => {
  const text = (
    '"Build \'some-repo-arn:some-commit-hash\' for build project \'some-project\' ' +
    'has reached the build status of \'FAILED\'."'
  );
  expect( index.getColorBySeverity( text ) ).toBe( 'danger' );
});

test( 'An in progress build gets a warning colour for Slack', () => {
  const text = (
    '"Build \'some-repo-arn:some-commit-hash\' for build project \'some-project\' ' +
    'has reached the build status of \'IN_PROGRESS\'."'
  );
  expect( index.getColorBySeverity( text ) ).toBe( 'warning' );
});

test( 'A generic notification gets a good colour for Slack', () => {
  const text = 'This is a generic notification.';
  expect( index.getColorBySeverity( text ) ).toBe( 'good' );
});

