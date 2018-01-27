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
      aws = require( 'aws-sdk' ),
      isPlainObj = require( 'is-plain-obj');

const DEBUG = 'true' === process.env.DEBUG;

exports.handler = ( event, context, callback ) => {

  if ( DEBUG ) console.log( JSON.stringify( event, null, 2 ) );

  console.log( 'From SNS:', event.Records[0].Sns.Message );

  let arn = event.Records[0].Sns.TopicArn;

  try {
    arn = event.Records[0].Sns.TopicArn.match( /\d\d\d:(.*)$/ )[1];
  } catch( error ) {
    // No need to do anything here.
  }

  const postData = {
    text:     event.Records[0].Sns.Subject ? '*' + event.Records[0].Sns.Subject + '*' : '',
    username: arn
  };

  if ( DEBUG ) postData.text += '\n' + JSON.stringify( event, null, 2 );

  const message = event.Records[0].Sns.Message;
  let severity = 'good';

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
    'Your quota allows for 0 more running instance'
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
    'Rollback of environment'
  ];

  for ( const dangerMessagesItem in dangerMessages ) {
    if ( -1 !== message.indexOf( dangerMessages[dangerMessagesItem] ) ) {
      severity = 'danger';
      break;
    }
  }

  // Only check for warning messages if necessary.
  if ( 'good' === severity ) {
    for ( var warningMessagesItem in warningMessages ) {
      if ( -1 !== message.indexOf( warningMessages[warningMessagesItem] ) ) {
        severity = 'warning';
        break;
      }
    }
  }

  const attachment = {
    color:  severity,
    text:   message,
    footer: event.Records[0].Sns.UnsubscribeUrl ? '<' + event.Records[0].Sns.UnsubscribeUrl + '|Unsubscribe>' : ''
  };

  // If the message is in JSON, format it more nicely.
  try {

    let json = JSON.parse( message );
    const fields = [];

    // In case we end up with a number, array or string - all of which could be valid JSON - we need to check.
    if ( isPlainObj( json ) ) {

      // Massage config change notifications from AWS Config - we only need the diff, not the whole config.
      if ( json.configurationItemDiff && 'ConfigurationItemChangeNotification' === json.messageType ) {
        json = json.configurationItemDiff;

        // Bring the changedProperties up to the first level if we only have changeType alongside it.
        if ( json.changedProperties && json.changeType && 2 === Object.keys( json ).length ) {
          let changeType = json.changeType;
          json = json.changedProperties;
          json.changeType = json.changeType || changeType;
        }
      }

      // If we only have one property, jump down a level and use that instead.
      while ( 1 === Object.keys( json ).length ) {
        json = json[ Object.keys( json ).shift() ];
      }

      Object.keys( json ).forEach( ( key ) => {
        fields.push({
          title: key,
          value: 'string' === typeof json[key] ? json[key] : JSON.stringify( json[key] )
        });
      });

      attachment.text = '';
      attachment.fields = fields;

    }

  } catch ( error ) {
    // Proceed without making any changes if we couldn't successfully parse JSON.
  }

  postData.attachments = [ attachment ];

  const options = {
    method: 'POST',
    hostname: 'hooks.slack.com',
    port: 443,
    path: '/services/' + process.env.SLACK_HOOK
  };

  if ( DEBUG ) console.log( options );

  const request = https.request( options, ( response ) => {

    let body = '';
    response.setEncoding( 'utf8' );

    response.on( 'data', ( chunk ) => {
      body += chunk;
    }).on('end', () => {
      console.log( 'Response from Slack: ' + body );
      callback( null, body );
    });
  });

  request.on( 'error' , ( error ) => {
    throw Error( 'Problem with Slack request: ' + error.message );
  });

  request.write( JSON.stringify( postData ) );
  request.end();

}; // Exports.handler.
