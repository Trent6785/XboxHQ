const { json, getAchievements } = require('../lib/xbl');
exports.handler = async (event) => {
  const titleId = (event.queryStringParameters && event.queryStringParameters.titleId) || '';
  if (!titleId) return json(400, { error: 'Missing titleId' });
  try { return json(200, await getAchievements(titleId)); }
  catch (e) { return json(e.status || 502, { error: e.message }); }
};
