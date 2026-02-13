/**
 * Comprehensive tests for PersistenceManager (Pure Generic CRUD Layer)
 *
 * PersistenceManager is now a pure generic CRUD abstraction.
 * Domain-specific operations are handled by repositories.
 */

import browser from "sinon-chrome";

import { PersistenceManager } from "./PersistenceManager";
import { testUtils } from "../../../tests/utils";

describe("PersistenceManager", () => {
  let persistenceManager: PersistenceManager;

  // Because the PersistenceManager is a singleton, and reset before each test,
  // the tests can't run concurrently.
  beforeEach(() => {
    testUtils.resetAll();
    PersistenceManager.resetInstance();
    persistenceManager = PersistenceManager.getInstance(
      browser.storage.local as unknown as chrome.storage.StorageArea
    );
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = PersistenceManager.getInstance();
      const instance2 = PersistenceManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should reset instance for testing", () => {
      const instance1 = PersistenceManager.getInstance();
      PersistenceManager.resetInstance();
      const instance2 = PersistenceManager.getInstance(
        browser.storage.local as unknown as chrome.storage.StorageArea
      );
      expect(instance1).not.toBe(instance2);
    });

    it("should throw error when getting instance without storage on first call", () => {
      PersistenceManager.resetInstance();
      expect(() => PersistenceManager.getInstance()).toThrow(
        "PersistenceManager must be initialized with storage parameter on first call"
      );
    });
  });

  describe("Storage Access", () => {
    it("should expose underlying storage area", () => {
      const storage = persistenceManager.getStorage();
      // sinon-chrome creates proxies, so we verify by checking key methods exist
      expect(storage.get).toBeDefined();
      expect(storage.set).toBeDefined();
      expect(storage.remove).toBeDefined();
      expect(storage.clear).toBeDefined();
    });
  });

  describe("Basic Storage Operations", () => {
    it("should set data", async () => {
      const testData = { testKey: "testValue" };

      await persistenceManager.set(testData);

      const storedData = await browser.storage.local.get(["testKey"]);
      expect(storedData.testKey).toBe("testValue");
    });

    it("should set complex data structures", async () => {
      const complexData = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        mixed: { items: ["a", "b"], count: 2 },
      };

      await persistenceManager.set(complexData);

      const storedData = await browser.storage.local.get([
        "nested",
        "array",
        "mixed",
      ]);
      expect(storedData.nested).toEqual({ deep: { value: 123 } });
      expect(storedData.array).toEqual([1, 2, 3]);
      expect(storedData.mixed).toEqual({ items: ["a", "b"], count: 2 });
    });

    it("should get data by single key", async () => {
      await browser.storage.local.set({ myKey: "myValue" });

      const result = await persistenceManager.get("myKey");

      expect(result.myKey).toBe("myValue");
    });

    it("should get data by multiple keys", async () => {
      await browser.storage.local.set({
        key1: "value1",
        key2: "value2",
        key3: "value3",
      });

      const result = await persistenceManager.get(["key1", "key2"]);

      expect(result.key1).toBe("value1");
      expect(result.key2).toBe("value2");
      expect(result.key3).toBeUndefined();
    });

    it("should return empty object for non-existent keys", async () => {
      const result = await persistenceManager.get("nonExistentKey");

      expect(result.nonExistentKey).toBeUndefined();
    });

    it("should remove data by single key", async () => {
      await browser.storage.local.set({ toRemove: "value" });

      await persistenceManager.remove("toRemove");

      const result = await browser.storage.local.get(["toRemove"]);
      expect(result.toRemove).toBeUndefined();
    });

    it("should remove data by multiple keys", async () => {
      await browser.storage.local.set({
        remove1: "value1",
        remove2: "value2",
        keep: "value3",
      });

      await persistenceManager.remove(["remove1", "remove2"]);

      const result = await browser.storage.local.get([
        "remove1",
        "remove2",
        "keep",
      ]);
      expect(result.remove1).toBeUndefined();
      expect(result.remove2).toBeUndefined();
      expect(result.keep).toBe("value3");
    });

    it("should clear all data", async () => {
      await browser.storage.local.set({
        data1: "value1",
        data2: "value2",
      });

      await persistenceManager.clear();

      const result = await browser.storage.local.get();
      expect(result).toEqual({});
    });
  });

  describe("Get All Operations", () => {
    it("should get all stored data", async () => {
      const testData = {
        key1: "value1",
        key2: { nested: true },
        key3: [1, 2, 3],
      };
      await browser.storage.local.set(testData);

      const result = await persistenceManager.getAll();

      expect(result).toEqual(testData);
    });

    it("should return empty object when storage is empty", async () => {
      const result = await persistenceManager.getAll();

      expect(result).toEqual({});
    });
  });

  describe("Error Handling", () => {
    it("should handle get operation errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browser.storage.local.get as any).callsFake(async () => {
        throw new Error("Storage read error");
      });

      await expect(persistenceManager.get("anyKey")).rejects.toThrow(
        "Failed to get storage data"
      );
    });

    it("should handle set operation errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browser.storage.local.set as any).callsFake(async () => {
        throw new Error("Storage full");
      });

      await expect(persistenceManager.set({ key: "value" })).rejects.toThrow(
        "Failed to set storage data"
      );
    });

    it("should handle remove operation errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browser.storage.local.remove as any).callsFake(async () => {
        throw new Error("Remove failed");
      });

      await expect(persistenceManager.remove("anyKey")).rejects.toThrow(
        "Failed to remove storage data"
      );
    });

    it("should handle clear operation errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browser.storage.local.clear as any).callsFake(async () => {
        throw new Error("Clear failed");
      });

      await expect(persistenceManager.clear()).rejects.toThrow(
        "Failed to clear storage data"
      );
    });

    it("should handle getAll operation errors", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (browser.storage.local.get as any).callsFake(async () => {
        throw new Error("Storage error");
      });

      await expect(persistenceManager.getAll()).rejects.toThrow(
        "Failed to get all storage data"
      );
    });
  });
});
