// openfarmgame.js
//
// data object representing the game itself
//
// Copyright 2013, StatusNet Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

var OpenFarmGame = {

    name: null,

    hostname: null,

    description: null,

    protocol: "http",

    url: function(rel) {
        var game = this;
        return game.protocol + "://" + game.hostname + rel;
    },

    asService: function() {

        var game = this;

        return {
            objectType: "service", // XXX: "game"?
            displayName: game.name,
            id: game.url("/"),
            url: game.url("/"),
            description: game.description
        };
    }
};

module.exports = OpenFarmGame;
