const { json, getScreenshots } = require('../lib/xbl');
exports.handler = async () => {
  try { return json(200, await getScreenshots()); }
  catch (e) { return json(e.status || 502, { error: e.message }); }
};
