$(function() {
    var updated = 0;
    $('[data-toggle=offcanvas]').click(function() {
      $('.row-offcanvas').toggleClass('active');
    });    //var url = 'http://192.168.1.91:3000';
    //var options = {};
    var primus = Primus.connect(window.location.href);
    //primus.write({ foo: 'bar' });
    //primus.write({ message: 'connected'});
    primus.on("end", function() {
        $(notification).html('<div class="alert alert-danger alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert">' +
                '<span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>Server closed the connection.</div>');
    });
    
    primus.on("data", function (d) {
        //console.log(JSON.stringify(d));
        var data = d.data;
        switch(d.type){
            case "error":
                var error = '<div class="alert alert-danger alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert">' +
                '<span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>'+data+'</div>'
                $(notification).html(error);
                break;
            case "message":
                var msg = '<div class="alert alert-info alert-dismissible" role="alert"><button type="button" class="close" data-dismiss="alert">' +
                '<span aria-hidden="true">&times;</span><span class="sr-only">Close</span></button>'+data+'</div>'
                $(notification).html(msg);
                break;
            case "contact":
                var photourl; 
                if (data.iconserver > 0) {
                    photourl = 'http://farm'+data.iconfarm+'.staticflickr.com/'+data.iconserver+'/buddyicons/'+data.nsid+'.jpg';
                } else {
                    photourl = 'http://www.flickr.com/images/buddyicon.gif';
                }
                var linkurl = 'http://www.flickr.com/photos/'+data.nsid;
                var photoclass = 'photo';
                if (data.mutual) {
                    photoclass = photoclass + ' mutual';
                }
                if (data.vip) {
                    photoclass = photoclass + ' vip';
                }
                $('#contactsthumbs').append('<div class="contact"><div class="'+photoclass+'"><a href="'+linkurl+'" target="browse"><img src="'+photourl+'" title="'+data.username+'"></a></div></div>');
                break;
            case "fave":
                var photourl = 'http://farm'+data.farm+'.staticflickr.com/'+data.server+'/'+data.photoID+'_'+data.secret+'_s.jpg';
                var linkurl = 'http://www.flickr.com/photos/'+data.ownerID+'/'+data.photoID;
                var photoclass = 'photo';
                if (data.vip) {
                    photoclass = photoclass + ' vip';
                }
                $('#favesthumbs').append('<div class="contact"><div class="'+photoclass+'"><a href="'+linkurl+'" target="browse"><img src="'+photourl+'"></a></div></div>');
                break;
            case "clear":
                $('#' + data).empty();
                break;
            case "update":
                $.each(data, function(key, value) {
                   console.log('key:' +key+ ', value: '+value);
                   if (key == 'lastsynccontacts' || key == 'lastsyncfaves' || key == 'lastaddfaves' || key == 'lastcleanupfaves' || key== 'lastactivitycheck')
                   { value = '<span value="'+value+'">'+moment(value).fromNow()+'</span>';}
                   //{ value = moment(value).fromNow();}
                   var id= '#'+key;
                   $(id).html(value);
               });
                break;
            case "progress":
                var percentage = 0;
                var progressdiv = '#'+data.id+'-progress';
                var progressbar = '#'+data.id+'-progressbar';
                var consolediv = '#'+data.id+'-console';
                if (data.status == 'start') {
                    //console.log('starting progress for '+data.id);
                    $(consolediv).addClass('hidden');
                    $(progressdiv).removeClass("hidden");
                    $(progressbar).attr('aria-valuenow',0);
                    $(progressbar).attr('aria-valuemax',data.total);
                    $(progressbar).text(percentage+'%');
                } else if (data.status == 'update') {
                    //console.log('update progress for '+data.id+' to ' +data.value);
                    $(progressbar).attr('aria-valuenow',data.value);
                    percentage = Math.round((data.value/data.total) * 100);
                    $(progressbar).text(percentage+'%');
                    $(progressbar).css('width',percentage+'%');
                } else if (data.status == 'finished') {
                    //console.log('finished progress for '+data.id);
                    $(progressbar).attr('aria-valuenow',data.value);
                    $(progressdiv).addClass("hidden");
                    $(consolediv).removeClass('hidden');
                }
                break;
               
        }
    });

    var refreshcontacts = function() {
       console.log('refreshing contacts');
       $('#contactsthumbs').empty();
       primus.write({ message: 'contacts'});
    }

    var refreshfaves = function() {
       console.log('refreshing faves');
       $('#favesthumbs').empty();
       primus.write({ message: 'favorites'});
    }

    var checkactivity = function() {
        console.log('checking recent activity on flickr...')
        primus.write({message:'getactivity'});
    }
    
    var checkcleanup = function() {
        console.log('cleaning up faves...');
        primus.write({message:'cleanupfaves', maxfaves:$('#maxnum').val(), minage:$('#minage').val()});
    }
    
    var updatelastactivity = function() {
        console.log('updating last activity timestamps...');
        primus.write({message:'updatelastactivity'});
    }

    $('#refreshcontacts').click(refreshcontacts);
    $('#refreshfaves').click(refreshfaves);

    $('#syncfaves').click(function() {
        console.log('synchronizing faves...');
        primus.write({message:'syncfaves'});
    });
    
    $('#synccontacts').click(function() {
        console.log('synchronizing contacts...');
        primus.write({message:'synccontacts'});
    });

    $('#addfaves').click(function() {
        console.log('adding faves...');
        primus.write({message:'addfaves', group:$('#addfavesgroup').val(), maxfaves:$('#maxfaves').val(), userlimit:$('#userlimit').val()});
    });
    
    $('#cleanup').click(checkcleanup);    
    $('#getactivity').click(checkactivity);
    refreshcontacts();
    refreshfaves();
    updatelastactivity();

    var updateeveryminute = function () {
        updated++;
        var arr = ['lastsynccontacts','lastsyncfaves','lastaddfaves','lastcleanupfaves','lastactivitycheck'];
        $.each(arr, function (i,el) {
            var value = $("#" + el).children().attr('value');
            if (value) {
                value = moment(value).fromNow();
                $("#" + el).children().html(value);
            }
        });
        // some things only need to be updated every hour
        if (updated % 60 === 0) {
            refreshcontacts();
            refreshfaves();
            updatelastactivity();
        }
        setTimeout(updateeveryminute, 60000);
    }   
    updateeveryminute();
});