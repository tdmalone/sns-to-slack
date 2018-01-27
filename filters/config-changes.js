
'use strict';

const TWO_PROPERTIES = 2;

/**
 * Filters change nofitications from AWS Config. We only need to be notified with the diff, not the
 * entire config.
 *
 * @param {object} input Incoming data as supplied by our filtering function.
 * @returns {object} The same data, but reduced to just the configurationItemDiff. No changes are
 *                   made if that property isn't present.
 */
module.exports = ( input ) => {

  if (
    ! input.configurationItemDiff ||
    'ConfigurationItemChangeNotification' !== input.messageType
  ) {
    return input;
  }

  // Reduce to just the diff.
  let output = input.configurationItemDiff;

  // Bring the changedProperties up to first level if the only other prop available is changeType.
  if (
    output.changedProperties &&
    output.changeType &&
    TWO_PROPERTIES === Object.keys( output ).length
  ) {
    output = output.changedProperties;
    output.changeType = output.changeType || input.configurationItemDiff.changeType;
  }

  return output;

}; // Module.exports.
