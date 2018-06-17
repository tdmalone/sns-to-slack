
'use strict';

module.exports = {

  extends: [ 'tdmalone' ],

  'rules': {

    // Shouldn't really do this, but maybe inheriting 15 is too low?
    'max-statements': [ 'error', { max: 20 } ]

  }
};
