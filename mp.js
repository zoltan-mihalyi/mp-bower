(function (global) {
    var mp;
    (function () {/**
 * @license almond 0.3.1 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/jrburke/almond for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true */
/*global setTimeout: false */

var requirejs, require, define;
(function (undef) {
    var main, req, makeMap, handlers,
        defined = {},
        waiting = {},
        config = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName) {
        var nameParts, nameSegment, mapValue, foundMap, lastIndex,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                name = name.split('/');
                lastIndex = name.length - 1;

                // Node .js allowance:
                if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                    name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                }

                //Lop off the last part of baseParts, so that . matches the
                //"directory" and not name of the baseName's module. For instance,
                //baseName of "one/two/three", maps to "one/two/three.js", but we
                //want the directory, "one/two" for this normalization.
                name = baseParts.slice(0, baseParts.length - 1).concat(name);

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            } else if (name.indexOf('./') === 0) {
                // No baseName, so this is ID is resolved relative
                // to baseUrl, pull off the leading dot.
                name = name.substring(2);
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName, forceSync) {
        return function () {
            //A version of a require function that passes a moduleName
            //value for items that may need to
            //look up paths relative to the moduleName
            var args = aps.call(arguments, 0);

            //If first arg is not require('string'), and there is only
            //one arg, it is the array form without a callback. Insert
            //a null so that the following concat is correct.
            if (typeof args[0] !== 'string' && args.length === 1) {
                args.push(null);
            }
            return req.apply(undef, args.concat([relName, forceSync]));
        };
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function makeLoad(depName) {
        return function (value) {
            defined[depName] = value;
        };
    }

    function callDep(name) {
        if (hasProp(waiting, name)) {
            var args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        }

        if (!hasProp(defined, name) && !hasProp(defining, name)) {
            throw new Error('No ' + name);
        }
        return defined[name];
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName) {
        var plugin,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName);
            plugin = callDep(prefix);
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName);
            }
        } else {
            name = normalize(name, relName);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];
            if (prefix) {
                plugin = callDep(prefix);
            }
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            p: plugin
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    main = function (name, deps, callback, relName) {
        var cjsModule, depName, ret, map, i,
            args = [],
            callbackType = typeof callback,
            usingExports;

        //Use name if no relName
        relName = relName || name;

        //Call the callback to define the module, if necessary.
        if (callbackType === 'undefined' || callbackType === 'function') {
            //Pull out the defined dependencies and pass the ordered
            //values to the callback.
            //Default to [require, exports, module] if no deps
            deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
            for (i = 0; i < deps.length; i += 1) {
                map = makeMap(deps[i], relName);
                depName = map.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    args[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    args[i] = handlers.exports(name);
                    usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    cjsModule = args[i] = handlers.module(name);
                } else if (hasProp(defined, depName) ||
                           hasProp(waiting, depName) ||
                           hasProp(defining, depName)) {
                    args[i] = callDep(depName);
                } else if (map.p) {
                    map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                    args[i] = defined[depName];
                } else {
                    throw new Error(name + ' missing ' + depName);
                }
            }

            ret = callback ? callback.apply(defined[name], args) : undefined;

            if (name) {
                //If setting exports via "module" is in play,
                //favor that over return value and exports. After that,
                //favor a non-undefined return value over exports use.
                if (cjsModule && cjsModule.exports !== undef &&
                        cjsModule.exports !== defined[name]) {
                    defined[name] = cjsModule.exports;
                } else if (ret !== undef || !usingExports) {
                    //Use the return value from the function.
                    defined[name] = ret;
                }
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            defined[name] = callback;
        }
    };

    requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
        if (typeof deps === "string") {
            if (handlers[deps]) {
                //callback in this case is really relName
                return handlers[deps](callback);
            }
            //Just return the module wanted. In this scenario, the
            //deps arg is the module name, and second arg (if passed)
            //is just the relName.
            //Normalize module name, if it contains . or ..
            return callDep(makeMap(deps, callback).f);
        } else if (!deps.splice) {
            //deps is a config object, not an array.
            config = deps;
            if (config.deps) {
                req(config.deps, config.callback);
            }
            if (!callback) {
                return;
            }

            if (callback.splice) {
                //callback is an array, which means it is a dependency list.
                //Adjust args if there are dependencies
                deps = callback;
                callback = relName;
                relName = null;
            } else {
                deps = undef;
            }
        }

        //Support require(['a'])
        callback = callback || function () {};

        //If relName is a function, it is an errback handler,
        //so remove it.
        if (typeof relName === 'function') {
            relName = forceSync;
            forceSync = alt;
        }

        //Simulate async callback;
        if (forceSync) {
            main(undef, deps, callback, relName);
        } else {
            //Using a non-zero value because of concern for what old browsers
            //do, and latest browsers "upgrade" to 4 if lower value is used:
            //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
            //If want a value immediately, use require('id') instead -- something
            //that works in almond on the global level, but not guaranteed and
            //unlikely to work in other AMD implementations.
            setTimeout(function () {
                main(undef, deps, callback, relName);
            }, 4);
        }

        return req;
    };

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        return req(cfg);
    };

    /**
     * Expose module registry for debugging and tooling
     */
    requirejs._defined = defined;

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            throw new Error('See almond README: incorrect module build, no module name');
        }

        //This module may not have dependencies
        if (!deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name) && !hasProp(waiting, name)) {
            waiting[name] = [name, deps, callback];
        }
    };

    define.amd = {
        jQuery: true
    };
}());

define("../../node_modules/almond/almond", function(){});

define('game/game-listener-impl',["require", "exports"], function (require, exports) {
    ///<reference path="game-listener.ts"/>
    function bind(fn, context) {
        return function () {
            fn.apply(context, arguments);
        };
    }
    var EVENTS = ['onJoin', 'onLeave', 'onReplication', 'onCallback', 'onCallback', 'onUserGameJoin', 'onUserGameLeave'];
    var GameListenerImpl = (function () {
        function GameListenerImpl(listener) {
            for (var i = 0; i < EVENTS.length; i++) {
                var event = EVENTS[i];
                if (listener[event]) {
                    this[event] = bind(listener[event], listener);
                }
            }
        }
        GameListenerImpl.prototype.onJoin = function (t) {
        };
        GameListenerImpl.prototype.onLeave = function (t) {
        };
        GameListenerImpl.prototype.onReplication = function (t, lastCommandIndex, elapsed, replicationData) {
        };
        GameListenerImpl.prototype.onCallback = function (callback, params) {
        };
        GameListenerImpl.prototype.onUserGameJoin = function (userGame) {
        };
        GameListenerImpl.prototype.onUserGameLeave = function (userGame) {
        };
        return GameListenerImpl;
    })();
    return GameListenerImpl;
});
//# sourceMappingURL=game-listener-impl.js.map;
///<reference path="id-provider.ts"/>
///<reference path="id-set.ts"/>
define('id-set-impl',["require", "exports"], function (require, exports) {
    var IdSetImpl = (function () {
        function IdSetImpl() {
            this.map = {};
        }
        IdSetImpl.prototype.put = function (element) {
            this.map[element.id] = element;
        };
        IdSetImpl.prototype.get = function (element) {
            return this.map[element.id];
        };
        IdSetImpl.prototype.getIndex = function (index) {
            return this.map[index];
        };
        IdSetImpl.prototype.remove = function (element) {
            delete this.map[element.id];
        };
        IdSetImpl.prototype.removeIndex = function (index) {
            delete this.map[index];
        };
        IdSetImpl.prototype.contains = function (element) {
            return this.map.hasOwnProperty(element.id + '');
        };
        IdSetImpl.prototype.containsIndex = function (index) {
            return this.map.hasOwnProperty(index + '');
        };
        IdSetImpl.prototype.forEach = function (callback) {
            for (var i in this.map) {
                if (this.map.hasOwnProperty(i)) {
                    callback(this.map[i], i);
                }
            }
        };
        return IdSetImpl;
    })();
    return IdSetImpl;
});
//# sourceMappingURL=id-set-impl.js.map;
define('id-map-impl',["require", "exports"], function (require, exports) {
    ///<reference path="id-provider.ts"/>
    ///<reference path="id-map.ts"/>
    var IdMapImpl = (function () {
        function IdMapImpl() {
            this.map = {};
        }
        IdMapImpl.prototype.put = function (key, value) {
            this.map[key.id] = value;
        };
        IdMapImpl.prototype.contains = function (key) {
            return this.map.hasOwnProperty(key.id + '');
        };
        IdMapImpl.prototype.get = function (key) {
            return this.map[key.id];
        };
        IdMapImpl.prototype.remove = function (key) {
            delete this.map[key.id];
        };
        return IdMapImpl;
    })();
    return IdMapImpl;
});
//# sourceMappingURL=id-map-impl.js.map;
define('game/client-game-impl',["require", "exports"], function (require, exports) {
    var ClientGameImpl = (function () {
        function ClientGameImpl(id, info, commandListener) {
            this.syncInterval = 100; //todo
            this.predictedCommands = {};
            this.lastSimulated = [];
            this.lastSyncId = 0;
            this.remote = false;
            this.id = id;
            this.info = info;
            this.onCommand = function () {
                commandListener.onCommand.apply(commandListener, arguments);
            };
            this.onSync = function () {
                commandListener.onSync.apply(commandListener, arguments);
            };
        }
        ClientGameImpl.prototype.stopSync = function () {
            clearInterval(this.syncIntervalId);
        };
        ClientGameImpl.prototype.startSync = function () {
            var _this = this;
            this.sync();
            this.syncIntervalId = setInterval(function () {
                _this.sync();
            }, this.syncInterval);
        };
        ClientGameImpl.prototype.getInfo = function () {
            return this.info;
        };
        ClientGameImpl.prototype.replaySimulation = function (index, elapsed) {
            var lastToRemove = -1;
            for (var i = 0; i < this.lastSimulated.length; i++) {
                var simulated = this.lastSimulated[i];
                if (simulated.index < index || (simulated.index === index && simulated.elapsed <= elapsed)) {
                    lastToRemove = i;
                }
                else {
                    break;
                }
            }
            this.lastSimulated.splice(0, lastToRemove + 1);
            for (var i = 0; i < this.lastSimulated.length; i++) {
                var lastSimulated = this.lastSimulated[i];
                lastSimulated.command.apply(null, lastSimulated.params);
            }
        };
        ClientGameImpl.prototype.execute = function (command) {
            var params = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                params[_i - 1] = arguments[_i];
            }
            var syncData = this.createSyncData();
            var predictedCommand = this.predictedCommands[command];
            if (predictedCommand) {
                predictedCommand.apply(null, params);
                this.lastSimulated.push({
                    command: predictedCommand,
                    params: params,
                    index: syncData.lastSyncId,
                    elapsed: 0
                });
            }
            this.onCommand(command, params, syncData.lastSyncId, syncData.elapsed);
        };
        ClientGameImpl.prototype.executeSimulation = function (fn) {
            this.lastSimulated.push({
                command: fn,
                params: [],
                index: this.lastSyncId,
                elapsed: new Date().getTime() - this.lastSync
            });
            fn();
        };
        ClientGameImpl.prototype.createSyncData = function () {
            var now = new Date().getTime();
            var elapsed = (this.lastSync ? now - this.lastSync : 0);
            this.lastSync = now;
            return {
                elapsed: elapsed,
                lastSyncId: ++this.lastSyncId
            };
        };
        ClientGameImpl.prototype.sync = function () {
            var syncData = this.createSyncData();
            this.onSync(syncData.lastSyncId, syncData.elapsed);
        };
        ClientGameImpl.prototype.setState = function (state) {
            this.state = state;
        };
        ClientGameImpl.prototype.getState = function () {
            return this.state;
        };
        ClientGameImpl.prototype.setReplicator = function (replicator) {
            this.replicator = replicator;
        };
        ClientGameImpl.prototype.getReplicator = function () {
            return this.replicator;
        };
        ClientGameImpl.prototype.setPredicted = function (command, handler) {
            this.predictedCommands[command] = handler;
        };
        return ClientGameImpl;
    })();
    return ClientGameImpl;
});
//# sourceMappingURL=client-game-impl.js.map;
define('client',["require", "exports", './game/game-listener-impl', './id-set-impl', './id-map-impl', './game/client-game-impl'], function (require, exports, GameListenerImpl, IdSetImpl, IdMapImpl, ClientGameImpl) {
    var Client = (function () {
        function Client(listener) {
            this.games = new IdSetImpl();
            this.callbacks = new IdMapImpl();
            this.listener = new GameListenerImpl(listener);
        }
        Client.prototype.accept = function (out) {
            var _this = this;
            if (this.out) {
                throw new Error('Client cannot accept more than one connection');
            }
            this.out = out;
            return {
                write: function (event) {
                    var clientGame;
                    switch (event.eventType) {
                        case 'JOIN':
                            var joinEvent = event;
                            clientGame = new ClientGameImpl(joinEvent.gameId, joinEvent.info, {
                                onCommand: function (command, params, index, elapsed) {
                                    var callbacks = [];
                                    for (var i = 0; i < params.length; i++) {
                                        var param = params[i];
                                        if (typeof param === 'function') {
                                            params[i] = _this.addCallback(clientGame, param);
                                            callbacks.push(i);
                                        }
                                    }
                                    var commandEvent = {
                                        eventType: 'COMMAND',
                                        gameId: joinEvent.gameId,
                                        command: command,
                                        params: params,
                                        callbacks: callbacks,
                                        index: index,
                                        elapsed: elapsed
                                    };
                                    out.write({
                                        reliable: true,
                                        keepOrder: true,
                                        data: commandEvent
                                    });
                                },
                                onSync: function (index, elapsed) {
                                    var syncEvent = {
                                        gameId: joinEvent.gameId,
                                        eventType: 'SYNC',
                                        index: index,
                                        elapsed: elapsed
                                    };
                                    out.write({
                                        reliable: true,
                                        keepOrder: true,
                                        data: syncEvent
                                    });
                                }
                            });
                            _this.games.put(clientGame);
                            clientGame.startSync();
                            _this.onJoin(clientGame);
                            break;
                        case 'LEAVE':
                            clientGame = _this.getGame(event);
                            clientGame.stopSync();
                            _this.onLeave(clientGame);
                            break;
                        case 'CALLBACK':
                            var callbackEvent = event;
                            clientGame = _this.getGame(callbackEvent);
                            _this.onCallback({
                                id: callbackEvent.callbackId,
                                clientGame: clientGame
                            }, callbackEvent.params);
                            break;
                        case 'REPLICATION':
                            var re = event;
                            var message = {
                                reliable: true,
                                keepOrder: true,
                                data: re.replicationData
                            };
                            _this.onReplication(_this.getGame(event), re.lastCommandIndex, re.elapsed, message);
                            break;
                    }
                },
                close: function () {
                    _this.out = null; //TODO more cleanup
                }
            };
        };
        Client.prototype.getGame = function (event) {
            return this.games.getIndex(event.gameId);
        };
        Client.prototype.addCallback = function (clientGame, callback) {
            var callbackContainer;
            if (!this.callbacks.contains(clientGame)) {
                callbackContainer = {
                    nextId: 0,
                    callbacks: {}
                };
                this.callbacks.put(clientGame, callbackContainer);
            }
            else {
                callbackContainer = this.callbacks.get(clientGame);
            }
            callbackContainer.callbacks[++callbackContainer.nextId] = callback;
            return callbackContainer.nextId;
        };
        Client.prototype.onJoin = function (clientGame) {
            this.listener.onJoin(clientGame);
        };
        Client.prototype.onLeave = function (clientGame) {
            this.listener.onLeave(clientGame);
            delete this.games[clientGame.id];
        };
        Client.prototype.onCallback = function (callback, params) {
            var callbackFn = this.callbacks.get(callback.clientGame).callbacks[callback.id];
            callbackFn.apply(null, params);
            this.listener.onCallback(callback, params);
        };
        Client.prototype.onUserGameJoin = function (userGame) {
            this.listener.onUserGameJoin(userGame);
        };
        Client.prototype.onUserGameLeave = function (userGame) {
            this.listener.onUserGameLeave(userGame);
        };
        Client.prototype.onReplication = function (clientGame, index, elapsed, message) {
            var replicationData = message.data;
            var state = clientGame.getState();
            if (!state) {
                throw new Error('State is not set in onJoin!');
            }
            var batch = state.createBatch();
            var replicator = clientGame.getReplicator();
            if (!replicator) {
                throw new Error('Replicator is not set in onJoin!');
            }
            replicator.onUpdate(replicationData, {
                forEach: function (c) {
                    state.forEach(c);
                },
                merge: function (item) {
                    var existing = state.get(item.id);
                    if (existing) {
                        batch.update(item);
                    }
                    else {
                        batch.create(item);
                    }
                },
                remove: function (id) {
                    batch.remove(id);
                },
                contains: function (id) {
                    return typeof state.get(id) !== 'undefined';
                },
                create: function (item) {
                    batch.create(item);
                }
            });
            batch.apply();
            this.listener.onReplication(clientGame, index, elapsed, replicationData);
            clientGame.replaySimulation(index, elapsed);
        };
        return Client;
    })();
    return Client;
});
//# sourceMappingURL=client.js.map;
define('replication/state-container',["require", "exports"], function (require, exports) {
    ///<reference path="../state/server-replication-state.ts"/>
    var StateContainer = (function () {
        function StateContainer(state) {
            this.state = state;
        }
        return StateContainer;
    })();
    return StateContainer;
});
//# sourceMappingURL=state-container.js.map;
///<reference path="../replicator-server.ts"/>
///<reference path="brute-force-message.ts"/>
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
define('replication/brute-force/brute-force-replicator-server',["require", "exports", '../state-container'], function (require, exports, StateContainer) {
    var BruteForceReplicatorServer = (function (_super) {
        __extends(BruteForceReplicatorServer, _super);
        function BruteForceReplicatorServer() {
            _super.apply(this, arguments);
            this.typeId = 0;
        }
        BruteForceReplicatorServer.prototype.update = function () {
            var entities = [];
            var num = 0;
            this.state.forEach(function (entity) {
                entities.push(entity);
                num++;
            });
            if (num === 0) {
                return [];
            }
            return [{
                reliable: false,
                keepOrder: true,
                data: entities
            }];
        };
        BruteForceReplicatorServer.prototype.firstUpdate = function () {
            return this.update();
        };
        return BruteForceReplicatorServer;
    })(StateContainer);
    return BruteForceReplicatorServer;
});
//# sourceMappingURL=brute-force-replicator-server.js.map;
define('game/user-game-impl',["require", "exports", '../replication/brute-force/brute-force-replicator-server', './client-game-impl'], function (require, exports, BruteForceReplicatorServer, ClientGameImpl) {
    var UserGameImpl = (function () {
        function UserGameImpl(game, user) {
            this.onLeave = function () {
            };
            this.commands = {}; //todo
            this.delays = [];
            this.replicationState = 1 /* BEFORE_FIRST_REPLICATION */;
            this.needSync = false;
            this.game = game;
            this.user = user;
            this.id = game.nextUserGameId();
            var clientGameId = user.addUserGame(this);
            this.clientGame = new ClientGameImpl(clientGameId, this.game.getInfo(), this);
        }
        UserGameImpl.prototype.enableSync = function () {
            this.replicationState = 0 /* WAITING_FOR_SYNC */;
            this.needSync = true;
        };
        UserGameImpl.prototype.getLastExecuted = function () {
            return this.lastSyncDelayedTime;
        };
        UserGameImpl.prototype.addToDelays = function (diff) {
            console.log(diff);
            for (var i = 0; i < this.delays.length; i++) {
                this.delays[i] += diff;
            }
        };
        UserGameImpl.prototype.runCommand = function (index, now, afterDelay) {
            if (afterDelay) {
                afterDelay();
            }
            if (index) {
                this.lastCommandIndex = index;
                this.lastSyncDelayedTime = now;
            }
        };
        UserGameImpl.prototype.sync = function (index, elapsed, afterDelay) {
            var _this = this;
            if (this.replicationState === 0 /* WAITING_FOR_SYNC */) {
                this.replicationState = 1 /* BEFORE_FIRST_REPLICATION */;
            }
            var now = new Date().getTime();
            if (!this.needSync) {
                this.runCommand(index, now, afterDelay);
                return;
            }
            if (!this.lastSyncTime) {
                this.lastSyncTime = now - elapsed;
            }
            this.lastSyncTime += elapsed;
            var neededDelay = this.lastSyncTime - now;
            this.delays.push(neededDelay);
            if (this.delays.length > 100) {
                this.delays.shift();
            }
            if (neededDelay < 0) {
                var correction = -neededDelay;
                this.lastSyncTime += correction;
                this.addToDelays(correction);
                neededDelay += correction;
            }
            setTimeout(function () {
                _this.runCommand(index, now + neededDelay, afterDelay);
            }, neededDelay);
            var min = Infinity;
            var max = 0;
            for (var i = 0; i < this.delays.length; i++) {
                var delay = this.delays[i];
                if (delay < min) {
                    min = delay;
                }
                if (delay > max) {
                    max = delay;
                }
            }
            if (min < Infinity && min > 10 + (max - min) / 3) {
                var correction = -min + 5;
                if (correction < -elapsed) {
                    correction = -elapsed;
                }
                this.lastSyncTime += correction;
                this.addToDelays(correction);
            }
        };
        UserGameImpl.prototype.onSync = function (index, elapsed) {
            this.sync(index, elapsed);
        };
        UserGameImpl.prototype.onCommand = function (command, params, index, elapsed) {
            var _this = this;
            this.sync(index, elapsed, function () {
                _this.commands[command].apply(_this, params);
            });
        };
        UserGameImpl.prototype.getRealState = function () {
            return this.game.getState();
        };
        UserGameImpl.prototype.leave = function () {
            var clientGame = this.getClientGame();
            this.user.onLeave(clientGame);
            this.game.onLeave(this);
            this.onLeave();
            if (!clientGame.remote) {
                clientGame.stopSync();
            }
        };
        UserGameImpl.prototype.addCommand = function (name, callback) {
            this.commands[name] = callback;
        };
        UserGameImpl.prototype.setRelevanceSet = function (relevanceSet, Replicator) {
            this.relevanceSet = relevanceSet;
            Replicator = Replicator || BruteForceReplicatorServer;
            this.relevanceSetReplicator = new Replicator(this.relevanceSet);
        };
        UserGameImpl.prototype.getRelevanceSet = function () {
            return this.relevanceSet;
        };
        UserGameImpl.prototype.getReplicator = function () {
            if (this.relevanceSet) {
                return this.relevanceSetReplicator;
            }
            else {
                return this.game.getReplicator();
            }
        };
        UserGameImpl.prototype.getClientGame = function () {
            return this.clientGame;
        };
        return UserGameImpl;
    })();
    return UserGameImpl;
});
//# sourceMappingURL=user-game-impl.js.map;
define('array-map',["require", "exports"], function (require, exports) {
    var ArrayMap = (function () {
        function ArrayMap() {
            this.keys = [];
            this.values = [];
        }
        ArrayMap.prototype.put = function (k, v) {
            var index = this.keys.indexOf(k); //todo
            if (index === -1) {
                this.keys.push(k);
                this.values.push(v);
            }
            else {
                this.values[index] = v;
            }
        };
        ArrayMap.prototype.remove = function (k) {
            var index = this.keys.indexOf(k); //todo
            if (index !== -1) {
                this.keys.splice(index, 1);
                this.values.splice(index, 1);
            }
        };
        ArrayMap.prototype.get = function (k) {
            return this.values[this.keys.indexOf(k)];
        };
        ArrayMap.prototype.contains = function (k) {
            return this.keys.indexOf(k) !== -1; //TODO
        };
        ArrayMap.prototype.forEach = function (callback) {
            for (var i = 0; i < this.keys.length; i++) {
                callback(this.keys[i], this.values[i]);
            }
        };
        return ArrayMap;
    })();
    return ArrayMap;
});
//# sourceMappingURL=array-map.js.map;
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
define('game/game-impl',["require", "exports", '../id-set-impl', './user-game-impl', './game-listener-impl', '../replication/brute-force/brute-force-replicator-server', '../array-map'], function (require, exports, IdSetImpl, UserGameImpl, GameListenerImpl, BruteForceReplicatorServer, ArrayMap) {
    var GameImpl = (function (_super) {
        __extends(GameImpl, _super);
        function GameImpl(info, gameListener, state) {
            var _this = this;
            _super.call(this, gameListener);
            this.userGames = new IdSetImpl();
            this._nextUserGameId = 0;
            this.info = info;
            this.state = state;
            if (state) {
                state.onRemove = function (e) {
                    _this.userGames.forEach(function (ug) {
                        var rel = ug.getRelevanceSet();
                        if (rel) {
                            rel.remove(e);
                        }
                    });
                };
            }
            this.setReplicator(BruteForceReplicatorServer);
        }
        GameImpl.prototype.nextUserGameId = function () {
            return ++this._nextUserGameId;
        };
        GameImpl.prototype.setReplicator = function (ReplicatorServer) {
            this.replicator = new ReplicatorServer(this.state);
        };
        GameImpl.prototype.getReplicator = function () {
            return this.replicator;
        };
        GameImpl.prototype.getInfo = function () {
            return this.info;
        };
        GameImpl.prototype.getState = function () {
            return this.state;
        };
        GameImpl.prototype.addUser = function (user) {
            var userGame = new UserGameImpl(this, user);
            this.userGames.put(userGame);
            var clientGame = userGame.getClientGame();
            user.onUserGameJoin(userGame);
            this.onJoin(userGame);
            user.onJoin(clientGame);
            if (!clientGame.remote) {
                clientGame.startSync();
            }
            return userGame;
        };
        GameImpl.prototype.netUpdate = function () {
            //az �sszes replik�torra mondunk egy update-et �s elk�ldj�k az usernek, de ami k�tszer van, arra nem 2x!
            var _this = this;
            var replicatorMessages = new ArrayMap();
            var now = new Date().getTime();
            this.userGames.forEach(function (userGame) {
                var replicator = userGame.getReplicator();
                var messages;
                var state = userGame.replicationState;
                switch (state) {
                    case 0 /* WAITING_FOR_SYNC */:
                        return;
                    case 1 /* BEFORE_FIRST_REPLICATION */:
                        messages = replicator.firstUpdate();
                        userGame.replicationState = 2 /* NORMAL */;
                        break;
                    case 2 /* NORMAL */:
                        if (!replicatorMessages.contains(replicator)) {
                            messages = replicator.update();
                            replicatorMessages.put(replicator, messages);
                        }
                        else {
                            messages = replicatorMessages.get(replicator);
                        }
                }
                for (var i = 0; i < messages.length; i++) {
                    var message = messages[i];
                    var clientGame = userGame.getClientGame();
                    var lastExecuted = userGame.getLastExecuted();
                    var elapsed = now - lastExecuted;
                    userGame.user.onReplication(clientGame, userGame.lastCommandIndex, elapsed, message);
                    _this.onReplication(userGame, userGame.lastCommandIndex, elapsed, message);
                }
            });
        };
        return GameImpl;
    })(GameListenerImpl);
    return GameImpl;
});
//# sourceMappingURL=game-impl.js.map;
///<reference path="user.ts"/>
///<reference path="messaging\writeable.ts"/>
///<reference path="game/user-game.ts"/>
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
define('user-impl',["require", "exports", './game/game-listener-impl'], function (require, exports, GameListenerImpl) {
    var UserImpl = (function (_super) {
        __extends(UserImpl, _super);
        function UserImpl() {
            _super.apply(this, arguments);
            this.nextId = 0;
            this.userGames = {};
        }
        UserImpl.prototype.getUserGame = function (id) {
            return this.userGames[id];
        };
        UserImpl.prototype.addUserGame = function (userGame) {
            var id = ++this.nextId;
            this.userGames[id] = userGame;
            return id;
        };
        UserImpl.prototype.forEachUserGame = function (callback) {
            for (var i in this.userGames) {
                callback(this.userGames[i]);
            }
        };
        return UserImpl;
    })(GameListenerImpl);
    return UserImpl;
});
//# sourceMappingURL=user-impl.js.map;
define('server-impl',["require", "exports", './user-impl'], function (require, exports, UserImpl) {
    var ServerImpl = (function () {
        function ServerImpl(connectionListener) {
            this.connectionListener = connectionListener || {
                onConnect: function () {
                }
            };
        }
        ServerImpl.prototype.accept = function (out) {
            var server = this;
            var result = {
                write: function (event) {
                    var userGame = user.getUserGame(event.gameId);
                    if (event.eventType === 'COMMAND') {
                        var commandEvent = event;
                        var params = [];
                        for (var i = 0; i < commandEvent.params.length; i++) {
                            params[i] = commandEvent.params[i];
                        }
                        for (var i = 0; i < commandEvent.callbacks.length; i++) {
                            var callbackIndex = commandEvent.callbacks[i];
                            params[callbackIndex] = (function (callbackId) {
                                return function () {
                                    user.onCallback({
                                        id: callbackId,
                                        clientGame: userGame.getClientGame()
                                    }, Array.prototype.splice.call(arguments, 0));
                                };
                            })(params[callbackIndex]);
                        }
                        userGame.onCommand(commandEvent.command, params, event.index, event.elapsed);
                    }
                    else if (event.eventType === 'SYNC') {
                        userGame.onSync(event.index, event.elapsed);
                    }
                },
                close: function () {
                    if (server.connectionListener.onDisconnect) {
                        server.connectionListener.onDisconnect(user);
                    }
                    user.forEachUserGame(function (userGame) {
                        userGame.leave();
                    });
                }
            };
            var user = this.createUser({
                onJoin: function (clientGame) {
                    clientGame.remote = true;
                    var joinEvent = {
                        eventType: 'JOIN',
                        gameId: clientGame.id,
                        info: clientGame.getInfo()
                    };
                    out.write({
                        reliable: true,
                        keepOrder: true,
                        data: joinEvent
                    });
                },
                onLeave: function (clientGame) {
                    var leaveEvent = {
                        eventType: 'LEAVE',
                        gameId: clientGame.id
                    };
                    out.write({
                        reliable: true,
                        keepOrder: true,
                        data: leaveEvent
                    });
                },
                onReplication: function (clientGame, lastCommandIndex, elapsed, message) {
                    var replicationEvent = {
                        eventType: 'REPLICATION',
                        gameId: clientGame.id,
                        replicationData: message.data,
                        lastCommandIndex: lastCommandIndex,
                        elapsed: elapsed
                    };
                    out.write({
                        reliable: message.reliable,
                        keepOrder: message.keepOrder,
                        data: replicationEvent
                    });
                },
                onCallback: function (callback, params) {
                    var callbackEvent = {
                        eventType: 'CALLBACK',
                        gameId: callback.clientGame.id,
                        callbackId: callback.id,
                        params: params
                    };
                    out.write({
                        reliable: true,
                        keepOrder: true,
                        data: callbackEvent
                    });
                },
                onUserGameJoin: function (userGame) {
                    userGame.enableSync();
                },
                onUserGameLeave: function (userGame) {
                }
            });
            return result;
        };
        ServerImpl.prototype.createUser = function (listener) {
            var user = new UserImpl(listener);
            this.connectionListener.onConnect(user);
            return user;
        };
        return ServerImpl;
    })();
    return ServerImpl;
});
//# sourceMappingURL=server-impl.js.map;
///<reference path="../replicator-client.ts"/>
///<reference path="brute-force-message.ts"/>
///<reference path="..\..\state\client-state.ts"/>
define('replication/brute-force/brute-force-replicator-client',["require", "exports"], function (require, exports) {
    var BruteForceReplicatorClient = (function () {
        function BruteForceReplicatorClient() {
        }
        BruteForceReplicatorClient.prototype.onUpdate = function (entities, batch) {
            var byId = {};
            for (var i = 0; i < entities.length; i++) {
                var e = entities[i];
                byId[e.id] = e;
            }
            batch.forEach(function (e) {
                if (!byId[e.id]) {
                    batch.remove(e.id);
                }
            });
            for (var i = 0; i < entities.length; i++) {
                batch.merge(entities[i]);
            }
        };
        return BruteForceReplicatorClient;
    })();
    return BruteForceReplicatorClient;
});
//# sourceMappingURL=brute-force-replicator-client.js.map;
define('array-set',["require", "exports"], function (require, exports) {
    var ArraySet = (function () {
        function ArraySet() {
            this.data = [];
        }
        ArraySet.prototype.add = function (t) {
            if (!this.contains(t)) {
                this.data.push(t);
                return true;
            }
            return false;
        };
        ArraySet.prototype.contains = function (t) {
            return this.data.indexOf(t) !== -1; //todo
        };
        ArraySet.prototype.remove = function (t) {
            var index = this.data.indexOf(t); //todo
            if (index !== -1) {
                this.data.splice(index, 1);
                return true;
            }
            return false;
        };
        ArraySet.prototype.forEach = function (callback) {
            for (var i = 0; i < this.data.length; i++) {
                callback(this.data[i]);
            }
        };
        return ArraySet;
    })();
    return ArraySet;
});
//# sourceMappingURL=array-set.js.map;
///<reference path="../state/server-state.ts"/>
///<reference path="visibility-group.ts"/>
///<reference path="relevance-set-vg.ts"/>
define('relevance/relevance-set-vg-impl',["require", "exports", '../array-map', '../array-set'], function (require, exports, ArrayMap, ArraySet) {
    var RelevanceSetVgImpl = (function () {
        function RelevanceSetVgImpl(state) {
            this.elements = new ArrayMap();
            this.visibilityGroups = [];
            this.state = state;
        }
        RelevanceSetVgImpl.prototype.remove = function (e) {
            if (!this.contains(e)) {
                return;
            }
            for (var i = 0; i < this.visibilityGroups.length; i++) {
                this.visibilityGroups[i].remove(e);
            }
        };
        RelevanceSetVgImpl.prototype.forEach = function (callback) {
            var _this = this;
            this.elements.forEach(function (element) {
                callback(_this.state.transform(element));
            });
        };
        RelevanceSetVgImpl.prototype.contains = function (e) {
            return this.elements.contains(e);
        };
        RelevanceSetVgImpl.prototype.createVisibilityGroup = function () {
            var vg = new VisibilityGroupImpl(this);
            this.visibilityGroups.push(vg);
            return vg;
        };
        RelevanceSetVgImpl.prototype.elementAdded = function (e) {
            if (this.elements.contains(e)) {
                this.elements.put(e, this.elements.get(e) + 1);
            }
            else {
                this.elements.put(e, 1);
            }
        };
        RelevanceSetVgImpl.prototype.elementRemoved = function (e) {
            var num = this.elements.get(e);
            if (num === 1) {
                this.elements.remove(e);
            }
            else {
                this.elements.put(e, num - 1);
            }
        };
        return RelevanceSetVgImpl;
    })();
    var VisibilityGroupImpl = (function () {
        function VisibilityGroupImpl(relevanceSet) {
            this.visible = new ArraySet();
            this.relevanceSet = relevanceSet;
        }
        VisibilityGroupImpl.prototype.add = function (e) {
            var relevanceSet = this.relevanceSet;
            if (this.visible.add(e)) {
                relevanceSet.elementAdded(e);
            }
        };
        VisibilityGroupImpl.prototype.remove = function (e) {
            if (this.visible.remove(e)) {
                this.relevanceSet.elementRemoved(e);
            }
        };
        VisibilityGroupImpl.prototype.removeEntities = function (filter) {
            var toRemove = [];
            this.visible.forEach(function (entity) {
                if (filter.call(entity, entity)) {
                    toRemove.push(entity);
                }
            });
            for (var i = 0; i < toRemove.length; i++) {
                this.remove(toRemove[i]);
            }
        };
        return VisibilityGroupImpl;
    })();
    return RelevanceSetVgImpl;
});
//# sourceMappingURL=relevance-set-vg-impl.js.map;
///<reference path="server.ts"/>
///<reference path="../typing/all.d.ts"/>
define('websocket-server',["require", "exports"], function (require, exports) {
    var WebsocketServer = (function () {
        function WebsocketServer(server, opts) {
            var ws = require('ws');
            var WSServer = ws.Server;
            this.server = server;
            this.wss = new WSServer(opts);
            this.wss.on('connection', function (ws) {
                var target = server.accept({
                    write: function (m) {
                        try {
                            ws.send(m.data);
                        }
                        catch (e) {
                        }
                    },
                    close: function () {
                        ws.close();
                    }
                });
                ws.on('message', function (message) {
                    target.write(message);
                });
                ws.on('close', function () {
                    target.close();
                });
            });
        }
        WebsocketServer.prototype.close = function () {
            this.wss.close();
        };
        return WebsocketServer;
    })();
    return WebsocketServer;
});
//# sourceMappingURL=websocket-server.js.map;
///<reference path="connection-acceptor.ts"/>
define('websocket-client',["require", "exports"], function (require, exports) {
    var WebsocketClient = (function () {
        function WebsocketClient(acceptor, url) {
            var ws = new WebSocket(url);
            ws.onopen = function () {
                var target = acceptor.accept({
                    write: function (message) {
                        //TODO reliable? keepOrder?
                        ws.send(message.data);
                    },
                    close: function () {
                        ws.close();
                    }
                });
                ws.onmessage = function (event) {
                    target.write(event.data);
                };
                ws.onclose = function () {
                    target.close();
                };
            };
        }
        return WebsocketClient;
    })();
    return WebsocketClient;
});
//# sourceMappingURL=websocket-client.js.map;
///<reference path="writeable.ts"/>
///<reference path="../connection-acceptor.ts"/>
///<reference path="async-convert.ts"/>
define('messaging/transformer',["require", "exports"], function (require, exports) {
    var Transformer = (function () {
        function Transformer(target, convertOutFrom, convertIn) {
            this.target = target;
            this.convertIn = convertIn;
            this.convertOutFrom = convertOutFrom;
        }
        Transformer.prototype.accept = function (out) {
            var _this = this;
            var t = this.target.accept({
                write: function (m) {
                    _this.convertOutFrom(m.data, function (data) {
                        out.write({
                            reliable: m.reliable,
                            keepOrder: m.keepOrder,
                            data: data
                        });
                    });
                },
                close: function () {
                    out.close();
                }
            });
            return {
                write: function (m) {
                    _this.convertIn(m, function (result) {
                        t.write(result);
                    });
                },
                close: function () {
                    t.close();
                }
            };
        };
        return Transformer;
    })();
    return Transformer;
});
//# sourceMappingURL=transformer.js.map;
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
define('messaging/json-transformer',["require", "exports", './transformer'], function (require, exports, Transformer) {
    function convert(data, callback) {
        var str;
        try {
            str = JSON.stringify(data);
        }
        catch (e) {
            console.log('Stringify error:', data);
            return;
        }
        callback(str);
    }
    function convertBack(data, callback) {
        var parsed;
        try {
            parsed = JSON.parse(data);
        }
        catch (e) {
            console.log('Parse error:' + data);
            return;
        }
        callback(parsed);
    }
    var JSONTransformer = (function (_super) {
        __extends(JSONTransformer, _super);
        function JSONTransformer(acceptor) {
            _super.call(this, acceptor, convert, convertBack);
        }
        return JSONTransformer;
    })(Transformer);
    return JSONTransformer;
});
//# sourceMappingURL=json-transformer.js.map;
var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
define('messaging/delay-transformer',["require", "exports", './transformer'], function (require, exports, Transformer) {
    function createDelay(delay) {
        return function (data, callback) {
            setTimeout(function () {
                callback(data);
            }, delay);
        };
    }
    var DelayTransformer = (function (_super) {
        __extends(DelayTransformer, _super);
        function DelayTransformer(target, delay1, delay2) {
            _super.call(this, target, createDelay(delay1), createDelay(delay2));
        }
        return DelayTransformer;
    })(Transformer);
    return DelayTransformer;
});
//# sourceMappingURL=delay-transformer.js.map;
define('main-impl',["require", "exports", './client', './game/game-impl', './server-impl', './replication/brute-force/brute-force-replicator-client', './relevance/relevance-set-vg-impl', './websocket-server', './websocket-client', './messaging/json-transformer', './messaging/delay-transformer'], function (require, exports, Client, Game, Server, BruteForceReplicatorClient, RelevanceSetVg, WebsocketServer, WebsocketClient, JSONTransformer, DelayTransformer) {
    var mp = {
        Client: Client,
        BruteForceReplicatorClient: BruteForceReplicatorClient,
        Server: Server,
        Game: Game,
        RelevanceSetVg: RelevanceSetVg,
        WebsocketServer: WebsocketServer,
        WebsocketClient: WebsocketClient,
        JSONTransformer: JSONTransformer,
        DelayTransformer: DelayTransformer
    };
    return mp;
});
//# sourceMappingURL=main-impl.js.map;
        mp = require('main-impl');
    })();
    if (typeof define && define.amd) {
        define([], mp);
    }
    global.mp = mp;
})(this);