/**
 * Lifecycle management types for content script components.
 *
 * These interfaces enable the ComponentRegistry to manage component lifecycles
 * without knowing anything about component internals.
 */

/**
 * Any component that can be managed by the registry.
 * This is the ONLY thing the registry knows about components.
 */
export interface Destroyable {
  destroy(): void;
}

/**
 * Creates components and identifies their DOM footprint.
 * The registry calls this - it never instantiates components directly.
 *
 * @template T - The component type (must be Destroyable)
 * @template TOptions - Options passed to create()
 */
export interface ComponentFactory<T extends Destroyable, TOptions = void> {
  /**
   * DOM selector to find orphaned instances.
   * Used to clean up elements from previous extension contexts.
   * Example: '#my-component, [data-wxt-shadow-root="my-component"]'
   */
  readonly selector: string;

  /**
   * Create a new component instance.
   * Called by the registry after orphan cleanup.
   */
  create(options: TOptions): Promise<T>;
}
