var db = WebSQL.create('AVCMobileTest');

var res = yield db.query('SELECT 1 + 1');

yield db.transaction(function(tr) {
  var res1 = yield tr.query('...');
  var res2 = yield tr.query('...');
});
