$(document).ready(function() {
  $('#navbutton').click(function() {
    $('.row-offcanvas').toggleClass('active');
  });  
    
    var maxheight = 0, maxwidth = 0, maxitems = 0;
    function Fave(data) {
        //console.log(JSON.stringify(data));
        var photourl = 'https://farm'+data.farm+'.staticflickr.com/'+data.server+'/'+data.photoID+'_'+data.secret+'_s.jpg';
        var linkurl = 'https://www.flickr.com/photos/'+data.ownerID+'/'+data.photoID;
        /*var photoclass = 'photo';
        if (data.vip) {
            photoclass = photoclass + ' vip';
        }*/
        var self = this;

        self.imagesrc = ko.observable(photourl);
        self.linkurl = ko.observable(linkurl);
        //self.photoclass = ko.observable(photoclass);
        self.dateadded = ko.observable(moment(data.dateadded).fromNow());
        self.owner = ko.observable(data.owner);
        self.vip = ko.observable(data.vip);
        self.hearticon = ko.computed(function() {return (self.vip() ? ' glyphicon-heart-empty' : 'glyphicon-heart')});
        self.addvip = ko.computed(function() {return (self.vip() ? 'Un-Protect' : 'Protect')});
        self.photoclass = ko.computed(function() {return (self.vip() ? 'photo vip' : 'photo')});
        self.id = data.photoID;
        self.removelink = '/favorites/remove?id='+data.photoID;
        //this.removelink = ''
        this.viplink = '/favorites/setvip?id='+data.photoID;
        self.removefave = function(callback) {
            $.getJSON("/favorites/remove?id="+self.id, function(allData) {
                if(allData == 'Ok') {
                    console.log('Successfully removed photo with id '+self.id);
                    callback(true);
                } else {
                    callback(false);
                }
            });            
        }
        self.setvip = function() {
            var value = (self.vip() ? 0 : 1); //toggle vip status
            $.getJSON("/favorites/setvip", { id:self.id, value:value})
             .done(function(allData) {
                if (allData == 'Ok') {
                    console.log('Successfully set VIP status for id '+self.id+' to '+value);
                    self.vip(value);
                    //self.photoclass(value ? 'photo vip' : 'photo');
                    //self.hearticon(),addvip and link need to be updated
                } else {
                    console.log('Error trying to set VIP status for id '+self.id+'. Expected \'Ok\', received \''+JSON.stringify(allData)+'\'');
                }
             })
        }
    }
    function FavoriteListViewModel() {
        // Data
        var self = this;
        self.items = ko.observableArray([]);
        self.items.extend({
            infinitescroll: {}
        });
        // set initial viewport size
        self.maxheight = ko.observable(maxheight);//function() {return ($(window).height() - $('#favesthumbs').offset().top)});
        self.maxwidth = ko.observable(maxwidth);
        self.maxheight(Math.floor($(window).height() - $('#favesthumbs').offset().top));
        self.maxwidth($('#main-content').innerWidth());//Math.floor($(window).width() - $('#favesthumbs').offset().left));

        // detect resize
        $(window).resize(function() {
            self.maxheight(Math.floor($(window).height() - $('#favesthumbs').offset().top));
            self.maxwidth($('#main-content').innerWidth());//Math.floor($(window).width() - $('#favesthumbs').offset().left));
            updateViewportDimensions();
        });
        
        $(window).scroll(_.debounce(function() {        
          self.items.infinitescroll.scrollY($(window).scrollTop());
           
           // add more items if scroll reaches the last 100 items
           if (self.items.peek().length - self.items.infinitescroll.lastVisibleIndex.peek() <= 50) {
               loadItems(50);
           }
        }, 250));
       
        self.removeitem = function(fave) {
            fave.removefave(function(result) {
                if (result == true) {
                    self.items.remove(fave);
                    //console.log('done');
                } else {
                    console.log('Error removing item from db');
                }
            });
        }
        function updateViewportDimensions() {
            var itemsRef = $('#favesthumbs'),
                itemRef = $('.contact').first(),
                itemsWidth = 870,
                itemsHeight = 870,
                itemWidth = 87,
                itemHeight = 87;
    
            
            self.items.infinitescroll.viewportWidth(self.maxwidth());
            self.items.infinitescroll.viewportHeight(self.maxheight());
            self.items.infinitescroll.itemWidth(itemWidth);
            self.items.infinitescroll.itemHeight(itemHeight);
            var itemsperrow = Math.max(Math.floor(self.maxwidth() / itemWidth),0);
            var maxrows = Math.max(Math.floor(self.maxheight() / itemHeight),0);
            maxitems = (maxrows + 1) * itemsperrow;
            
            console.log ('max height: '+self.maxheight()+' max width: '+self.maxwidth()+' max items: '+maxitems+' ('+itemsperrow+' * ' +maxrows+')');
    
        }
        updateViewportDimensions();
        function loadItems(num) {
            var i = self.items().length;
            var existingitems = [];
            if (i) {
                existingitems = self.items();
            }
            $.getJSON("/table/favorites", {orderby: 'dateadded desc', limit: i + ','+(num+i)})
                      .done(function(allData) {
                        var mappedItems = $.map(allData, function(item) { return new Fave(item) });
                        console.log('mappedItems: '+mappedItems.length+', existingitems: '+existingitems.length);
                        //$.extend(existingitems,mappedItems);
                        for (var idx = 0; idx < mappedItems.length; idx++) {
                            self.items.push(mappedItems[idx]);
                        }
                        
                        console.log('mappedItems: '+mappedItems.length+', existingitems: '+existingitems.length);
                        //self.items(existingitems);
                        //console.log(JSON.stringify(existingitems));
                      });
        }
        /*$.getJSON("/table/favorites?orderby=dateadded_desc&limit="+maxitems, function(allData) {
            var mappedItems = $.map(allData, function(item) { return new Fave(item) });
            self.items(mappedItems);
        });*/
        loadItems(maxitems);
    
    }
    ko.applyBindings(new FavoriteListViewModel());
    
    /*var removefave = function(id) {
        $.getJSON("/favorites/remove?id="+id, function(allData) {
            console.log(allData);
        });
    }*/
    var mouseenter = function(el) {
        var context = ko.contextFor(el);
        $(el).find('.caption').fadeIn(250);
    }
    var mouseleave = function(el) {
        var context = ko.contextFor(el);
        $(el).find('.caption').fadeOut(250);
    }
    $("[rel='tooltip']").tooltip();

    $('#favesthumbs').on("mouseenter",".contact", function() {mouseenter(this)});
    $('#favesthumbs').on("mouseleave",".contact", function() {mouseleave(this)});

});