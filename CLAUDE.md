# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a TypeScript-based Firefox extension that tracks time spent on different domains. The extension displays an always-visible timer pill on web pages and provides aggregated statistics through a popup interface.

## Architecture

The extension follows a layered architecture with clear separation of concerns:

- **Background Layer**: Core business logic, session management, and browser event handling
- **Content Layer**: DOM manipulation and user interface injection
- **Storage Layer**: Data persistence and aggregation with type-safe interfaces
- **Types Layer**: Comprehensive TypeScript definitions for all data structures and APIs

## Development Commands

### Build & Development
```bash
npm run build:dev          # Development build with source maps
npm run build:prod         # Production build optimized for distribution
npm run watch              # Watch mode for development
npm run dev                # Development mode with auto-reload
```

### Testing
```bash
npm test                   # Run all tests
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Generate coverage report
```

### Code Quality
```bash
npm run type-check         # TypeScript type checking without compilation
npm run lint               # ESLint code analysis
npm run lint:fix           # Auto-fix ESLint issues
```

### Packaging
```bash
npm run clean              # Clean build artifacts
npm run package            # Create extension package for distribution
```

## Project Structure

```
src/
├── background/            # Background script and services
│   ├── background.ts      # Main background script entry point
│   ├── services/          # Core business logic services
│   └── models/            # Data models and storage abstractions
├── content/               # Content scripts and UI components
│   ├── content.ts         # Content script entry point
│   ├── components/        # UI components (time pill)
│   └── styles/            # Component styling
├── popup/                 # Extension popup interface
├── types/                 # TypeScript type definitions
│   ├── storage.ts         # Storage schema and data types
│   ├── session.ts         # Session management types
│   ├── messages.ts        # Inter-component message types
│   └── browser.d.ts       # Browser API extensions
└── tests/                 # Test suites organized by type
```

## Key Components

### TimeTracker Service
Core time tracking logic with millisecond precision. Handles session start/stop/pause operations and maintains accurate time calculations.

### SessionManager Service  
Manages active sessions and browser event integration. Handles tab switches, window focus changes, and session state transitions.

### StorageManager Model
Type-safe abstraction over browser.storage.local with data migration support and atomic operations.

### TimeDisplayPill Component
Always-visible floating timer pill that displays current session time with smooth hover fade effects.

## TypeScript Integration

This project is TypeScript-first with comprehensive type safety:

- **Strict TypeScript**: Full strict mode enabled with explicit typing requirements
- **Browser API Types**: Extended type definitions for Firefox WebExtension APIs
- **Message Typing**: Strongly typed inter-component communication
- **Storage Schema**: Type-safe data persistence with migration support

### Key Type Interfaces

- `StorageSchema`: Complete storage structure definition
- `ActiveSession`: Current tracking session data
- `DomainData`: Per-domain time tracking statistics  
- `ExtensionMessage`: Union type for all inter-component messages

## Testing Strategy

### Unit Tests
Individual component testing with Jest and TypeScript support. Focus on business logic, calculations, and data transformations.

### Integration Tests  
Cross-component interaction testing with mocked browser APIs. Validates message passing and event handling.

### E2E Tests
Complete workflow testing using web-ext and Selenium. Tests real browser interactions and extension lifecycle.

## Browser Event Handling

The extension integrates with critical Firefox APIs:

- `tabs.onActivated`: Switches tracking between tabs
- `tabs.onUpdated`: Handles URL changes and page navigation  
- `windows.onFocusChanged`: Pauses/resumes tracking based on window focus
- `webNavigation.onCompleted`: Starts tracking when pages finish loading

## Data Storage

### Storage Schema
Data is organized with domain-level aggregation and daily statistics buckets for efficient querying and storage optimization.

### Time Aggregation
- Real-time updates with 1-second precision
- Daily buckets prevent storage bloat
- Cached calculations for weekly/monthly/all-time totals
- Configurable data retention policies

## Development Workflow

1. **Setup**: `npm install` to install dependencies
2. **Development**: `npm run dev` for watch mode with auto-reload
3. **Testing**: `npm run test:watch` for continuous testing during development  
4. **Type Checking**: `npm run type-check` before commits
5. **Building**: `npm run build:prod` for production builds
6. **Packaging**: `npm run package` to create distributable extension

## Build System

Webpack-based build system with:
- TypeScript compilation via ts-loader
- CSS extraction and optimization
- Source map generation for debugging  
- Separate entry points for background, content, and popup scripts
- Extension manifest processing and asset copying

## Code Style

- **TypeScript**: Strict typing with explicit return types for functions
- **ESLint**: Enforced code quality and consistency rules
- **Naming**: Descriptive names following TypeScript conventions
- **Error Handling**: Typed error classes with context information
- **Async/Await**: Preferred over Promise chains for readability
- **File Format**: Ensure all files end with a newline 

## Extension Permissions

The extension requires these Firefox permissions:
- `tabs`: Tab monitoring and management
- `storage`: Local data persistence
- `activeTab`: Current tab information access
- `webNavigation`: Page load event detection
- `idle`: Browser idle state detection
- `<all_urls>`: Content script injection across all websites

## Privacy & Security

- **Local Storage Only**: No external data transmission
- **Domain-Level Tracking**: URLs are not stored, only domain names
- **User Control**: Configurable data retention and exclusion lists
- **Minimal Permissions**: Only essential browser APIs are requested

## Code Principles

- If non-test implementation changes cause existing tests to fail, never change the tests— instead update the implementation to pass tests.

## Testing Guidelines

- To consider a test implementation complete, it must not contain commented out code (unless as an illustration to explain how the test currently works).
- After writing tests, run them to ensure the expected outcome is observed (new tests are allowed to fail before feature implementation is complete).

## Development Memories

- New tests should not prevent the test system from running.
- Never mark a failing test to be skipped. Either fix the implementation or take steps to ensure that the requirement/feature spec is correct.
- Ensure all text files end in a newline.
- Gradually iterate on implementation: start with a test validating the expected behavior, then implement just enough to pass the test.
- Avoid writing functionality or code that isn't being used in the current development iteration.

## Version Control Practices

- Follow good version control practices:
    - Make small commits
    - Commit often
    - Do not commit broken code or failing tests
    - Follow a trunk-based development paradigm
