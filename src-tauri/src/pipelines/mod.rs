//! Pipelines (SPEC §5): discovery, questions, walkthrough, ask, discussion,
//! review. Each one is: build the prompt → run the agent → parse → verify →
//! persist. The per-pipeline modules do the first four against a `PassCtx`
//! and are what the contract tests and the eval runner call; `engine` adds
//! persistence, events, cancellation and the session lifecycle.

pub mod ask;
pub mod context;
pub mod discovery;
pub mod discussion;
pub mod engine;
pub mod instructions;
pub mod questions;
pub mod review;
pub mod walkthrough;

pub use context::{Outcome, PassCtx};
pub use engine::{Engine, EventSink, NullSink};
