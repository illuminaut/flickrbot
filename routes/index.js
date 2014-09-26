var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'flickrbot', activelink: 'overview' });
});

/*router.get('/log', function(req, res) {
  res.render('log', { title: 'flickrbot' });
});

router.get('/contacts', function(req, res) {
  res.render('contacts', { title: 'flickrbot' });
});*/

module.exports = router;
