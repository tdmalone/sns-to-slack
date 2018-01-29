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
      globby = require( 'globby' ),
      isPlainObj = require( 'is-plain-obj' );

/* eslint-disable no-process-env */
const DEBUG = 'true' === process.env.DEBUG,
      SLACK_HOOK = process.env.SLACK_HOOK;
/* eslint-enable no-process-env */

const INDEX_OF_NOT_PRESENT = -1,
      FIRST_ITEM = 0,
      FIRST_MATCH = 1,
      ONE_PROPERTY = 1,
      JSON_SPACES = 2,
      SLACK_COLUMN_LENGTH = 28;

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
        arn = sns.TopicArn,
        topicName = getNameFromArn( arn );

  console.log( 'From SNS:', sns );

  const slackMessage = {
    text:     sns.Subject ? '*' + sns.Subject + '*' : '',
    username: topicName || arn
  };

  if ( DEBUG ) slackMessage.text += '\n' + JSON.stringify( event, null, JSON_SPACES );

  const attachment = {
    color:  getColorBySeverity( sns.Message ),
    text:   sns.Message,
    footer: ( sns.UnsubscribeUrl ? '<' + sns.UnsubscribeUrl + '|Unsubscribe>' : '' )
  };

  // If we can format our message into fields, do that instead of printing it as text.
  attachment.text = maybeGetAttachmentFields( sns.Message );
  if ( 'object' === typeof attachment.text ) {
    attachment.fields = attachment.text;
    attachment.text = '';
  }

  // Trim quotes, in case we've ended up with a JSON string.
  if ( 'string' === typeof attachment.text ) {
    attachment.text = attachment.text.replace( /(^"|"$)/g, '' );
  }

  slackMessage.attachments = [ attachment ];

  sendToSlack( slackMessage, callback );

}; // Exports.handler.

/**
 * Sends a message to Slack, calling a callback when complete or throwing on error.
 *
 * @param {object} message The message to send.
 * @param {function} callback A callback to call on completion.
 * @returns {undefined}
 * @see https://api.slack.com/docs/messages
 * @see https://api.slack.com/incoming-webhooks
 */
function sendToSlack( message, callback ) {

  const options = {
    method:   'POST',
    hostname: 'hooks.slack.com',
    port:     443,
    path:     '/services/' + SLACK_HOOK
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

  request.write( JSON.stringify( message ) );
  request.end();

} // Function sendToSlack.

/**
 * Given a standard ARN of an SNS topic, attempts to return just the name of the topic.
 *
 * @param {string} arn A full Amazon Resource Name for an SNS topic.
 * @returns {string|boolean} Either the topic name, or false if it could not be determined.
 */
function getNameFromArn( arn ) {

  try {
    return arn.match( /\d\d\d:(.*)$/ )[ FIRST_MATCH ];
  } catch ( error ) {
    return false;
  }

} // Function getNameFromArn.

/**
 * Given message text from an SNS notification, attempts to determine the severity of the
 * notification and return an appropriate colour setting for a Slack message attachment.
 *
 * @param {string} text The message text supplied by the incoming SNS notification.
 * @returns {string} A valid Slack colour setting: 'danger', 'warning', 'good', or possibly a hex
 *                   code.
 * @see https://api.slack.com/docs/message-attachments#color
 */
function getColorBySeverity( text ) {

  for ( const dangerMessagesItem in dangerMessages ) {
    if ( INDEX_OF_NOT_PRESENT !== text.indexOf( dangerMessages[dangerMessagesItem]) ) {
      return 'danger';
    }
  }

  for ( const warningMessagesItem in warningMessages ) {
    if ( INDEX_OF_NOT_PRESENT !== text.indexOf( warningMessages[warningMessagesItem]) ) {
      return 'warning';
    }
  }

  return 'good';

} // Function getColorBySeverity.

/**
 * Given an incoming SNS message, attempts to convert it into Slack message attachment fields.
 * This improves readability - it's much easier to decipher than JSON!
 *
 * @param {string} text An incoming SNS message.
 * @returns {array|string} An array of Slack attachment fields if possible; otherwise a string to
 *                         be used as the message text. The string will either be the same as the
 *                         input, or reduced down to a string if it is the only property in an
 *                         object.
 * @see https://api.slack.com/docs/message-attachments#fields
 */
function maybeGetAttachmentFields( text ) {

  const fields = [];
  let data = '';

  try {
    data = JSON.parse( text );
  } catch ( error ) {
    return text;
  }

  // We don't want to try splitting up a number, array or string.
  if ( ! isPlainObj( data ) ) {
    return text;
  }

  // Apply any registered filters in ./filters/.
  data = applyParsingFilters( data );

  // If we only have one property, jump down a level and use that instead.
  // We also need to check that we have an array or an object too.
  while ( 'object' === typeof data && ONE_PROPERTY === Object.keys( data ).length ) {
    data = data[ Object.keys( data ).shift() ];
  }

  // And, in case we haven't ended up with an object...
  if ( ! isPlainObj( data ) ) {
    return JSON.stringify( data );
  }

  // Turn all remaining properties into fields.
  Object.keys( data ).forEach( ( key ) => {

    const value = 'string' === typeof data[key] ? data[key] : JSON.stringify( data[key]);

    fields.push({
      title: key,
      value: value,
      short: value.length <= SLACK_COLUMN_LENGTH
    });

  });

  return fields;

} // Function maybeGetAttachmentFields.

/**
 * Given an input, runs it through any supplied filter functions and returns the resulting output.
 *
 * @param {object} input The input object.
 * @returns {object} output The resulting object, after being passed through all filters.
 */
function applyParsingFilters( input ) {

  const parsingFilters = globby.sync( 'filters/**/*.js' );
  let output = input;

  parsingFilters.forEach( ( filter ) => {
    output = require( filter )( output );
  });

  return output;

} // Function applyParsingFilters.

// Export functions for unit testing.
exports.getNameFromArn = getNameFromArn;
exports.getColorBySeverity = getColorBySeverity;
exports.maybeGetAttachmentFields = maybeGetAttachmentFields;
