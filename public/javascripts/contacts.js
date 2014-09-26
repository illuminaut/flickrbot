$(function() {
  $('#navbutton').click(function() {
    $('.row-offcanvas').toggleClass('active');
  });  

    function Contact(data) {
        //console.log(JSON.stringify(data));
        var photourl; 
        if (data.iconserver > 0) {
            photourl = 'https://farm'+data.iconfarm+'.staticflickr.com/'+data.iconserver+'/buddyicons/'+data.nsid+'.jpg';
        } else {
            photourl = 'https://www.flickr.com/images/buddyicon.gif';
        }
        var linkurl = 'https://www.flickr.com/photos/'+data.nsid;
        var photoclass = 'thumbnail';
        if (data.mutual) {
            photoclass = photoclass + ' mutual';
        }
        if (data.vip) {
            photoclass = photoclass + ' vip';
        }
        //$('#contactsthumbs').append('<div class="contact"><div class="'+photoclass+'"><a href="'+linkurl+'" target="browse"><img src="'+photourl+'" title="'+data.username+'"></a></div></div>');

        this.imagesrc = ko.observable(photourl);
        this.linkurl = ko.observable(linkurl);
        this.photoclass = ko.observable(photoclass);
        this.username = ko.observable(data.username);
        //console.log(photourl+','+linkurl+','+photoclass);
    }
    function ContactListViewModel() {
        // Data
        var self = this;
        self.rows = ko.observableArray([]);
        $.getJSON("/table/contacts?orderby=dateadded&limit=500", function(allData) {
            var mappedRows = $.map(allData, function(item) { return new Contact(item) });
            self.rows(mappedRows);
        });    
    
    }
    
    ko.applyBindings(new ContactListViewModel());
    
});