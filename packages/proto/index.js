const path = require('path');

const PROTO_PATHS = {
  auth: path.join(__dirname, 'auth.proto'),
  catalog: path.join(__dirname, 'catalog.proto'),
  order: path.join(__dirname, 'order.proto'),
  inventory: path.join(__dirname, 'inventory.proto'),
  notification: path.join(__dirname, 'notification.proto'),
};

module.exports = {
  PROTO_PATHS,
};
