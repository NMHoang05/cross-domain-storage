/**
 * Created by dagan on 07/04/2014.
 * Modified by hoang on 11/24/2016
 */
'use strict';
/* global XdUtils */
(function () {

  var MESSAGE_NAMESPACE = 'cross-domain-local-message';
  var SYNC_STORAGE_NAMESPACE = 'cross-domain-storage-sync';

  var defaultData = {
    namespace: MESSAGE_NAMESPACE,
    normal_response: true
  };
  var autoSync = false;
  var lastSyncTime = 0;
  var syncTimer = {};

  function postData(id, data) {
    var mergedData = XdUtils.extend(data, defaultData);
    mergedData.id = id;
    parent.postMessage(JSON.stringify(mergedData), '*');
  }

  var local = {
    getData: function(id, key) {
      if (Array.isArray(key)) {
        var values = [];
        for(var i = 0; i < key.length; i++) {
          values.push(localStorage.getItem(key[i]));
        }
        postData(id, {
          key: key,
          value: values
        });
      } else {
        postData(id, {
          key: key,
          value: localStorage.getItem(key)
        });
      }
    },

    setData: function(id, key, value) {
      if (Array.isArray(key)) {
        var values = [];
        var ok;
        for(var i = 0; i < key.length; i++) {
          localStorage.setItem(key[i], value[i]);
          ok = value[i] === localStorage.getItem(key[i]);
          values.push(ok);
        }
        postData(id, {
          key: key,
          success: values
        });
      } else {
        localStorage.setItem(key, value);
        postData(id, {
          success: localStorage.getItem(key) === value
        });
      }
    },

    removeData: function(id, key) {
      if (Array.isArray(key)) {
        for(var i = 0; i < key.length; i++) {
          localStorage.removeItem(key[i]);
        }
      } else {
        localStorage.removeItem(key);
      }
      postData(id, {});
    },

    getKey: function(id, index) {
      if (Array.isArray(index)) {
        var keys = [];
        for(var i = 0; i < index.length; i++) {
          keys.push(localStorage.key(index[i]));
        }
        postData(id, {key: keys});
      } else {
        postData(id, {key: localStorage.key(index)});
      }
    },

    getSize: function(id) {
      var size = JSON.stringify(localStorage).length;
      postData(id, {size: size});
    },

    getLength: function(id) {
      var length = localStorage.length;
      postData(id, {length: length});
    },

    clear: function(id) {
      localStorage.clear();
      postData(id, {});
    }
  };

  var session = {
    getData: function(id, key) {
      if (Array.isArray(key)) {
        var values = [];
        for(var i = 0; i < key.length; i++) {
          values.push(sessionStorage.getItem(key[i]));
        }
        postData(id, {
          key: key,
          value: values
        });
      } else {
        postData(id, {
          key: key,
          value: sessionStorage.getItem(key)
        });
      }
    },

    setData: function(id, key, value) {
      if (Array.isArray(key)) {
        var values = [];
        var sync_k = [];
        var sync_v = [];
        var ok;
        for(var i = 0; i < key.length; i++) {
          sessionStorage.setItem(key[i], value[i]);
          ok = value[i] === sessionStorage.getItem(key[i]);
          values.push(ok);
          if (ok) {
            sync_k.push(key[i]);
            sync_v.push(value[i]);
          }
        }
        if (autoSync && sync_k.length > 0) session.syncAuto(sync_k, sync_v);
        postData(id, {
          key: key,
          success: values
        });
      } else {
        sessionStorage.setItem(key, value);
        var data = {
          success: sessionStorage.getItem(key) === value
        };
        if (autoSync && data.success) session.syncAuto(key, value);
        postData(id, data);
      }
    },

    removeData: function(id, key) {
      if (Array.isArray(key)) {
        for(var i = 0; i < key.length; i++) {
          sessionStorage.removeItem(key[i]);
        }
      } else {
        sessionStorage.removeItem(key);
      }
      if (autoSync) session.syncAuto(key, null);
      postData(id, {});
    },

    getKey: function(id, index) {
      if (Array.isArray(index)) {
        var keys = [];
        for(var i = 0; i < index.length; i++) {
          keys.push(sessionStorage.key(index[i]));
        }
        postData(id, {key: keys});
      } else {
        postData(id, {key: sessionStorage.key(index)});
      }
    },

    getSize: function(id) {
      var size = JSON.stringify(sessionStorage).length;
      postData(id, {size: size});
    },

    getLength: function(id) {
      var length = sessionStorage.length;
      postData(id, {length: length});
    },

    clear: function(id) {
      if (autoSync) session.syncAuto(null, null);
      sessionStorage.clear();
      postData(id, {});
    },

    syncManual: function(id, keys) {
      var data = {
        type: 'request',
        method: 'manual',
        id: id,
        keys: keys,
        time: new Date().getTime()
      };
      try {
        localStorage.setItem(SYNC_STORAGE_NAMESPACE, JSON.stringify(data));
        localStorage.removeItem(SYNC_STORAGE_NAMESPACE);
      } catch(err) {
        postData(id, {status: 1, message: err});
        return;
      }

      syncTimer[id] = setTimeout(function() {
        delete syncTimer[id];
        // sync timed out
        postData(id, {status: 1, message: 'timed out'});
      }, 1000);
    },

    syncAuto: function(key, value) {
      var i;
      var respond = { type: 'response', method: 'auto', id: null, keys: [], hash: {} };
      if (key != null) {
        if (Array.isArray(key)) {
          for(i = 0; i < key.length; i++) {
            respond.keys.push(key[i]);
            respond.hash[key[i]] = value[i];
          }
        } else {
          respond.keys.push(key);
          respond.hash[key] = value;
        }
      } else {
        var k;
        for(i = 0; i < sessionStorage.length; i++) {
          k = sessionStorage.key(i);
          respond.keys.push(k);
          respond.hash[k] = null;
        }
      }

      localStorage.setItem(SYNC_STORAGE_NAMESPACE, JSON.stringify(respond));
      localStorage.removeItem(SYNC_STORAGE_NAMESPACE);
    }
  };

  function receiveMessage(event) {
    var data;
    try {
      data = JSON.parse(event.data);
    } catch (err) {
      //not our message, can ignore
      return;
    }

    try {
      // check if storages are enabled
      var l = localStorage.length;
      l = sessionStorage.length;
      console.log("Test storage blocking" + l);
    } catch (err) {
      //blocked
      postData(data.id, {
        normal_response: false,
        error: err.toString()
      });
      return;
    }

    if (data && data.namespace === MESSAGE_NAMESPACE) {
      if (data.type == 'local') {
        if (data.action === 'set') {
          local.setData(data.id, data.key, data.value);
        } else if (data.action === 'get') {
          local.getData(data.id, data.key);
        } else if (data.action === 'remove') {
          local.removeData(data.id, data.key);
        } else if (data.action === 'key') {
          local.getKey(data.id, data.key);
        } else if (data.action === 'size') {
          local.getSize(data.id);
        } else if (data.action === 'length') {
          local.getLength(data.id);
        } else if (data.action === 'clear') {
          local.clear(data.id);
        }
      }
      if (data.type == 'session') {
        if (data.action === 'set') {
          session.setData(data.id, data.key, data.value);
        } else if (data.action === 'get') {
          session.getData(data.id, data.key);
        } else if (data.action === 'remove') {
          session.removeData(data.id, data.key);
        } else if (data.action === 'key') {
          session.getKey(data.id, data.key);
        } else if (data.action === 'size') {
          session.getSize(data.id);
        } else if (data.action === 'length') {
          session.getLength(data.id);
        } else if (data.action === 'clear') {
          session.clear(data.id);
        } else if (data.action === 'sync') {
          session.syncManual(data.id, data.key);
        } else if (data.action === 'option') {
          if (data.key == 'auto-sync') {
            autoSync = data.value;
            postData(data.id, {});
          }
        }
      }
    }
  }

  function storageProcess(event) {
    if (event.newValue == null) return;
    if (event.key != SYNC_STORAGE_NAMESPACE) return;
    var data;
    try {
      data = JSON.parse(event.newValue);
    } catch (err) {
      //not our message, can ignore
      return;
    }

    var i;
    if (data.type == 'request') {
      var keys = [];
      if (data.keys == null || typeof data.keys != 'string' || data.keys.trim().length == 0) {
        for( i = 0; i < sessionStorage.length; i++) {
          keys.push(sessionStorage.key(i));
        }
      } else {
        keys = JSON.parse(data.keys);
      }

      var respond = { type: 'response', id: data.id, keys: keys, hash: {} };
      for( i = 0; i < keys.length; i++) {
        respond.hash[keys[i]] = sessionStorage.getItem(keys[i]);
      }

      localStorage.setItem(SYNC_STORAGE_NAMESPACE, JSON.stringify(respond));
      localStorage.removeItem(SYNC_STORAGE_NAMESPACE);
      return;
    }

    if (data.type == 'response') {
      if (!data.keys || !data.keys.length) {
        if (data.id) {
          if (lastSyncTime == 0) {
            lastSyncTime = new Date().getTime();
          }

          if (syncTimer[data.id]) {
            clearTimeout(syncTimer[data.id]);
            delete syncTimer[data.id];
          }

          postData(data.id, {status: 2, message: 'nothing to sync  ' + JSON.stringify(data)});
        }
        return;
      }

      for( i = 0; i < data.keys.length; i++) {
        if (data.hash[data.keys[i]] == null) {
          sessionStorage.removeItem(data.keys[i]);
        } else {
          sessionStorage.setItem(data.keys[i], data.hash[data.keys[i]]);
        }
      }

      if (data.id) {
        if (lastSyncTime == 0) {
          lastSyncTime = new Date().getTime();
        }

        if (syncTimer[data.id]) {
          clearTimeout(syncTimer[data.id]);
          delete syncTimer[data.id];
        }

        postData(data.id, {status: 0, message: 'sync completed'});
      } else {
        if (data.method == 'auto') postData(null, {status: 0, keys: data.keys, hash: data.hash});
      }
    }
  }

  if (window.addEventListener) {
    window.addEventListener('message', receiveMessage, false);
    window.addEventListener('storage', storageProcess, false);
  } else {
    window.attachEvent('onmessage', receiveMessage);
    window.attachEvent('onstorage', storageProcess);
  }

  function sendOnLoad() {
    var data = {
      namespace: MESSAGE_NAMESPACE,
      id: 'iframe-ready'
    };
    parent.postMessage(JSON.stringify(data), '*');
  }
  //on creation
  sendOnLoad();
})();
