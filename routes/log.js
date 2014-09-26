var express = require('express');
var router = express.Router();

/* GET log page. */
router.get('/log', function(req, res) {
  res.render('log', { title: 'flickrbot' });
});

module.exports = router;
