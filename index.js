/**
 * AWS Lambda function to send SNS notifications to a Slack channel.
 * Based on a gist by Joseph Terranova.
 *
 * @author Joseph Terranova
 * @author Tim Malone <tdmalone@gmail.com>
 * @see https://gist.github.com/terranware/962da63ca547f55667f6
 */

'use strict';

const https = require( 'https' ),
      isPlainObj = require( 'is-plain-obj' );

/* eslint-disable no-process-env */
const DEBUG = 'true' === process.env.DEBUG,
      slackHook = process.env.SLACK_HOOK;
/* eslint-enable no-process-env */

const INDEX_OF_NOT_PRESENT = -1,
      FIRST_ITEM = 0,
      FIRST_MATCH = 1,
      ONE_PROPERTY = 1,
      TWO_PROPERTIES = 2,
      JSON_SPACES = 2;

const dangerMessages = [
  ' but with errors',
  ' to RED',
  'During an aborted deployment',
  'Failed to deploy application',
  'Failed to deploy configuration',
  'has a dependent object',
  'is not authorized to perform',
  'Pending to Degraded',
  'Stack deletion failed',
  'Unsuccessful command execution',
  'You do not have permission',
  'Your quota allows for 0 more running instance',
  ' has reached the build status of \'FAILED\''
];

const warningMessages = [
  ' aborted operation.',
  ' to YELLOW',
  'Adding instance ',
  'Degraded to Info',
  'Deleting SNS topic',
  'is currently running under desired capacity',
  'Ok to Info',
  'Ok to Warning',
  'Pending Initialization',
  'Removed instance ',
  'Rollback of environment',
  ' has reached the build status of \'IN_PROGRESS\''
];

exports.handler = ( event, context, callback ) => {

  if ( DEBUG ) console.log( JSON.stringify( event, null, JSON_SPACES ) );

  const sns = event.Records[ FIRST_ITEM ].Sns,
        arn = sns.TopicArn;

  console.log( 'From SNS:', sns.Message );

  let topicName = '';

  try {
    topicName = arn.match( /\d\d\d:(.*)$/ )[ FIRST_MATCH ];
  } catch ( error ) {

    // No need to do anything here.
  }

  const slackMessage = {
    text:     sns.Subject ? '*' + sns.Subject + '*' : '',
    username: topicName || arn
  };

  if ( DEBUG ) slackMessage.text += '\n' + JSON.stringify( event, null, JSON_SPACES );

  const messageText = sns.Message;
  let severity = 'good';

  for ( const dangerMessagesItem in dangerMessages ) {
    if ( INDEX_OF_NOT_PRESENT !== messageText.indexOf( dangerMessages[dangerMessagesItem]) ) {
      severity = 'danger';
      break;
    }
  }

  // Only check for warning messages if a danger message hasn't been selected.
  if ( 'good' === severity ) {
    for ( const warningMessagesItem in warningMessages ) {
      if ( INDEX_OF_NOT_PRESENT !== messageText.indexOf( warningMessages[warningMessagesItem]) ) {
        severity = 'warning';
        break;
      }
    }
  }

  const attachment = {
    color:  severity,
    text:   messageText,
    footer: ( sns.UnsubscribeUrl ? '<' + sns.UnsubscribeUrl + '|Unsubscribe>' : '' )
  };

  // If the message is in JSON, format it more nicely.
  try {

    let json = JSON.parse( messageText );
    const fields = [];

    // In case we end up with a number, array or string - which would be all valid JSON...
    if ( isPlainObj( json ) ) {

      // Massage change notifs from AWS Config - we only need the diff, not the whole config.
      if (
        json.configurationItemDiff &&
        'ConfigurationItemChangeNotification' === json.messageType
      ) {
        json = json.configurationItemDiff;

        // Bring the changedProperties up to first level if we only have changeType alongside it.
        if (
          json.changedProperties &&
          json.changeType &&
          TWO_PROPERTIES === Object.keys( json ).length
        ) {
          let changeType = json.changeType;
          json = json.changedProperties;
          json.changeType = json.changeType || changeType;
        }
      }

      // If we only have one property, jump down a level and use that instead.
      while ( ONE_PROPERTY === Object.keys( json ).length ) {
        json = json[ Object.keys( json ).shift() ];
      }

      Object.keys( json ).forEach( ( key ) => {
        fields.push({
          title: key,
          value: 'string' === typeof json[key] ? json[key] : JSON.stringify( json[key])
        });
      });

      attachment.text = '';
      attachment.fields = fields;

    }

  } catch ( error ) {

    // Proceed without making any changes if we couldn't successfully parse JSON.
  }

  slackMessage.attachments = [ attachment ];

  const options = {
    method:   'POST',
    hostname: 'hooks.slack.com',
    port:     443,
    path:     '/services/' + slackHook
  };

  if ( DEBUG ) console.log( options );

  const request = https.request( options, ( response ) => {

    let body = '';
    response.setEncoding( 'utf8' );

    response.on( 'data', ( chunk ) => {
      body += chunk;
    }).on( 'end', () => {
      console.log( 'Response from Slack: ' + body );
      callback( null, body );
    });
  });

  request.on( 'error', ( error ) => {
    throw Error( 'Problem with Slack request: ' + error.message );
  });

  request.write( JSON.stringify( slackMessage ) );
  request.end();

}; // Exports.handler.
