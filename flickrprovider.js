var config = require("./oauth.js");

var Flickr = require("flickrapi"),
    flickrOptions = {
      api_key: config.api_key,
      secret: config.secret,
      user_id: config.user_id,
      permissions: "delete",
      force_auth: true,
      access_token: config.access_token,
      access_token_secret: config.access_token_secret
    }, flickrapi;
    

// Constructor
function flickrprovider() {
  Flickr.authenticate(flickrOptions, function(error, flickr) {
  if (error) throw(error)
  else flickrapi = flickr;
  });
}

flickrprovider.favegroup = function(callback,group,maxphotos) {
  flickrapi.groups.pools.getPhotos({
    group_id: group,
    page: 1,
    per_page: maxphotos
  }, function(error, result) {
    callback(error,result);
  });
}

flickrprovider.addfave = function(callback,photo) {
    flickrapi.favorites.add({photo_id: photo.id}, function(error, result) {
        callback(error,result);
    });
}
flickrprovider.getfaves = function(callback,page) {
    if(global.debug) {
        console.log('getfaves called with page '+page);
    }
    flickrapi.favorites.getList({page: page, per_page: 500}, function(error, result) {
        callback(error,result);
    });
}
flickrprovider.removefave = function(callback,id) {
    if (global.debug) {
        console.log('removing fave from flickr with id '+id);
    }
    flickrapi.favorites.remove({photo_id: id}, function(error,result) {
       callback(error,result); 
    });
}

flickrprovider.getcontacts = function(callback,page) {
    flickrapi.contacts.getList({sort:'time',page:page,per_page: 500},function(error,result) {
        callback(error,result);
    });
}

flickrprovider.getContactInfo = function(callback, id) {
    var error = {};
    if (!id) {
        //var error = [];
        error.message = 'getContactInfo must be called with a user ID';
        callback(error, null);
    }
    flickrapi.people.getInfo({user_id:id, url:null}, function(error,result) {
        callback(error,result);
    });
}
flickrprovider.addContact = function(callback,id) {
    if (!id) {
        //var error = [];
        error.message = 'getContactInfo must be called with a user ID';
        callback(error, null);
    }
    flickrapi.add
}

flickrprovider.getActivity = function(callback,page) {
    flickrapi.activity.userPhotos({timeframe:'100d',page:page,per_page:50}, function(error,result) {
       callback(error,result); 
    });
}
module.exports = flickrprovider;
