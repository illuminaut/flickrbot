$(function() {
  $('#navbutton').click(function() {
    $('.row-offcanvas').toggleClass('active');
  });  


    function Activity(data) {
        this.timestamp = ko.observable(data.timestamp);
        this.action = ko.observable(data.action);
        this.message = ko.observable(data.message);
    }
    function ActivityListViewModel() {
        // Data
        var self = this;
        self.rows = ko.observableArray([]);
        $.getJSON("/table/activitylog", {orderby: 'timestamp DESC', limit: 30} , function(allData) {
            var mappedRows = $.map(allData, function(item) { return new Activity(item) });
            self.rows(mappedRows);
        });    
    
    }
    
    ko.applyBindings(new ActivityListViewModel());
    
});