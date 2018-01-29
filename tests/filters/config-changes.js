/**
 * Tests the config changes filter in ./../../filters/config-changes.js.
 *
 * @author Tim Malone <tdmalone@gmail.com>
 */

/* global expect */

'use strict';

const FIRST_ITEM = 0;

const filter = require( '../../filters/config-changes' ),
      fixture = require( '../fixtures/config-change.json' ).Records[ FIRST_ITEM ].Sns.Message;

test( 'Non-config change items get left alone', () => {

  const data = {
    someItem: 'someData'
  };

  expect( filter( data ) ).toBe( data );

});

test( 'Data w/ several diff items is reduced to the diff value', () => {

  const data = JSON.parse( fixture );

  data.configurationItemDiff.extraItem = {};
  expect( filter( data ) ).toBe( data.configurationItemDiff );

});

test( 'Data w/ only diff.changedProperties and diff.changeType is reduced and combined', () => {

  const data = JSON.parse( fixture ),
        combined = cloneObject( data.configurationItemDiff.changedProperties );

  combined.changeType = data.configurationItemDiff.changeType;
  expect( filter( data ) ).toEqual( combined );

});

/**
 * Deep clones an object so we can safely modify its properties without affecting other instances.
 *
 * @param {object} object An object to clone.
 * @returns {object} The same object data, as a separate instance.
 */
function cloneObject( object ) {
  return JSON.parse( JSON.stringify( object ) );
}

