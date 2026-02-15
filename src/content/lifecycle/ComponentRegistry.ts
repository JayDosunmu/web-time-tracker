/**
 * Component Registry - Lifecycle management for content script components.
 *
 * Responsibilities:
 * - Track active components by name
 * - Clean up orphaned DOM elements before creating new components
 * - Provide centralized destroy for all components
 *
 * Does NOT know:
 * - Component internals (state, callbacks, rendering)
 * - How components work - only that they can be destroyed
 */

import type { Destroyable, ComponentFactory } from "./types";

/**
 * Registry interface for component lifecycle management.
 */
export interface IComponentRegistry {
  /**
   * Register and create a component.
   * 1. Removes any orphaned DOM elements matching factory.selector
   * 2. Destroys existing component with same name (if any)
   * 3. Creates component via factory.create()
   * 4. Tracks the component for future cleanup
   */
  register<T extends Destroyable, TOptions>(
    name: string,
    factory: ComponentFactory<T, TOptions>,
    options: TOptions
  ): Promise<T>;

  /**
   * Get a registered component by name.
   */
  get<T extends Destroyable>(name: string): T | undefined;

  /**
   * Destroy all registered components and clear tracking.
   * Called on extension unload.
   */
  destroyAll(): void;
}

/**
 * Singleton registry for managing content script component lifecycles.
 */
export class ComponentRegistry implements IComponentRegistry {
  private static instance: ComponentRegistry | null = null;
  private components = new Map<string, Destroyable>();
  private readonly instanceId: string;

  private constructor() {
    // Private constructor for singleton
    this.instanceId = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[ComponentRegistry] 🏗️ NEW INSTANCE created: ${this.instanceId}`);
  }

  /**
   * Get the singleton instance.
   */
  public static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      console.log(`[ComponentRegistry] 📦 Creating new singleton instance...`);
      ComponentRegistry.instance = new ComponentRegistry();
    } else {
      console.log(`[ComponentRegistry] 📦 Returning existing instance: ${ComponentRegistry.instance.instanceId}`);
    }
    return ComponentRegistry.instance;
  }

  /**
   * Reset the singleton instance. Used for testing.
   */
  public static resetInstance(): void {
    console.log(`[ComponentRegistry] 🔄 resetInstance() called`);
    if (ComponentRegistry.instance) {
      console.log(`[ComponentRegistry] 🧹 Destroying existing instance: ${ComponentRegistry.instance.instanceId}`);
      ComponentRegistry.instance.destroyAll();
    }
    ComponentRegistry.instance = null;
  }

  /**
   * Register and create a component with automatic orphan cleanup.
   */
  public async register<T extends Destroyable, TOptions>(
    name: string,
    factory: ComponentFactory<T, TOptions>,
    options: TOptions
  ): Promise<T> {
    console.log(`[ComponentRegistry:${this.instanceId}] 📝 register("${name}") START - selector: "${factory.selector}"`);

    // 1. Clean orphaned DOM elements from previous extension contexts
    this.cleanupOrphanedElements(factory.selector);

    // 2. Destroy existing component with same name (if re-registering)
    const existing = this.components.get(name);
    if (existing) {
      console.log(`[ComponentRegistry:${this.instanceId}] ♻️ Destroying existing component "${name}" before re-registration`);
      try {
        existing.destroy();
      } catch (error) {
        console.error(`Error destroying existing component "${name}":`, error);
      }
      this.components.delete(name);
    }

    // 3. Create new component via factory
    console.log(`[ComponentRegistry:${this.instanceId}] 🏭 Calling factory.create() for "${name}"...`);
    const component = await factory.create(options);
    console.log(`[ComponentRegistry:${this.instanceId}] ✅ factory.create() completed for "${name}"`);

    // 4. Track it
    this.components.set(name, component);
    console.log(`[ComponentRegistry:${this.instanceId}] 📝 register("${name}") COMPLETE - now tracking ${this.components.size} component(s)`);

    return component;
  }

  /**
   * Get a registered component by name.
   */
  public get<T extends Destroyable>(name: string): T | undefined {
    return this.components.get(name) as T | undefined;
  }

  /**
   * Check if a component is registered.
   */
  public has(name: string): boolean {
    return this.components.has(name);
  }

  /**
   * Destroy all registered components and clear tracking.
   */
  public destroyAll(): void {
    console.log(`[ComponentRegistry:${this.instanceId}] 🧹 destroyAll() START - ${this.components.size} component(s) to destroy`);
    for (const [name, component] of this.components.entries()) {
      console.log(`[ComponentRegistry:${this.instanceId}] 💥 Destroying component "${name}"...`);
      try {
        component.destroy();
        console.log(`[ComponentRegistry:${this.instanceId}] ✅ Component "${name}" destroyed`);
      } catch (error) {
        console.error(`Error destroying component "${name}":`, error);
      }
    }
    this.components.clear();
    console.log(`[ComponentRegistry:${this.instanceId}] 🧹 destroyAll() COMPLETE`);
  }

  /**
   * Remove orphaned DOM elements matching the selector.
   * These are elements from previous extension contexts that weren't cleaned up.
   */
  private cleanupOrphanedElements(selector: string): void {
    if (!selector || typeof document === "undefined") {
      console.log(`[ComponentRegistry:${this.instanceId}] 🔍 cleanupOrphanedElements() - skipped (no selector or no document)`);
      return;
    }

    console.log(`[ComponentRegistry:${this.instanceId}] 🔍 cleanupOrphanedElements() - searching for: "${selector}"`);

    try {
      const orphans = document.querySelectorAll(selector);
      console.log(`[ComponentRegistry:${this.instanceId}] 🔍 Found ${orphans.length} element(s) matching selector`);

      if (orphans && orphans.length > 0) {
        // Log details about each orphan
        Array.from(orphans).forEach((el, index) => {
          console.log(`[ComponentRegistry:${this.instanceId}] 🗑️ Removing orphan ${index + 1}/${orphans.length}: id="${el.id}", tagName="${el.tagName}"`);
          el.remove();
        });
        console.log(`[ComponentRegistry:${this.instanceId}] ✅ Removed ${orphans.length} orphaned element(s)`);
      } else {
        console.log(`[ComponentRegistry:${this.instanceId}] ✅ No orphans found - DOM is clean`);
      }
    } catch (error) {
      console.error(
        `ComponentRegistry: Error cleaning up orphans for selector "${selector}":`,
        error
      );
    }
  }
}
