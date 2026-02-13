// Mock for WXT modules in Jest tests
module.exports = {
  createShadowRootUi: jest.fn().mockResolvedValue({
    mount: jest.fn(),
    remove: jest.fn(),
  }),
};
