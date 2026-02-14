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

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get the singleton instance.
   */
  public static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry();
    }
    return ComponentRegistry.instance;
  }

  /**
   * Reset the singleton instance. Used for testing.
   */
  public static resetInstance(): void {
    if (ComponentRegistry.instance) {
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
    // 1. Clean orphaned DOM elements from previous extension contexts
    this.cleanupOrphanedElements(factory.selector);

    // 2. Destroy existing component with same name (if re-registering)
    const existing = this.components.get(name);
    if (existing) {
      try {
        existing.destroy();
      } catch (error) {
        console.error(`Error destroying existing component "${name}":`, error);
      }
      this.components.delete(name);
    }

    // 3. Create new component via factory
    const component = await factory.create(options);

    // 4. Track it
    this.components.set(name, component);

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
    for (const [name, component] of this.components.entries()) {
      try {
        component.destroy();
      } catch (error) {
        console.error(`Error destroying component "${name}":`, error);
      }
    }
    this.components.clear();
  }

  /**
   * Remove orphaned DOM elements matching the selector.
   * These are elements from previous extension contexts that weren't cleaned up.
   */
  private cleanupOrphanedElements(selector: string): void {
    if (!selector || typeof document === "undefined") return;

    try {
      const orphans = document.querySelectorAll(selector);
      if (orphans && orphans.length > 0) {
        console.log(
          `ComponentRegistry: Cleaning up ${orphans.length} orphaned element(s) matching "${selector}"`
        );
        // Use Array.from for better compatibility with test environments
        Array.from(orphans).forEach((el) => el.remove());
      }
    } catch (error) {
      console.error(
        `ComponentRegistry: Error cleaning up orphans for selector "${selector}":`,
        error
      );
    }
  }
}
