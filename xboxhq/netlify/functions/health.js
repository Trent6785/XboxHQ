const { json, health } = require('../lib/xbl');
exports.handler = async () => {
  try { return json(200, await health()); }
  catch (e) { return json(500, { error: e.message }); }
};
