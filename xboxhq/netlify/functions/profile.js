const { json, getProfile } = require('../lib/xbl');
exports.handler = async () => {
  try { return json(200, await getProfile()); }
  catch (e) { return json(e.status || 502, { error: e.message }); }
};
