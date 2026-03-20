# Performance and Cost Optimization Guide

Shannon includes several optimization features to reduce runtime and LLM costs while maintaining security analysis quality.

## Overview

The optimization system includes:

1. **Incremental Scanning**: Only analyzes changed files between runs
2. **Smart Context Window Management**: Prioritizes high-risk code paths
3. **Caching**: Caches code analysis results across runs
4. **Model Tier Optimization**: Uses smaller models where appropriate
5. **Parallel Agent Optimization**: Better resource allocation

## Configuration

Add optimization settings to your `configs/*.yaml` file:

```yaml
pipeline:
  optimization:
    # Enable incremental scanning (only analyze changed files)
    enable_incremental_scan: true
    
    # Enable caching of analysis results
    enable_caching: true
    
    # Prioritize high-risk files (auth, input handling, etc.)
    enable_context_prioritization: true
    
    # Optimize model tier selection
    enable_model_optimization: true
    
    # Maximum context size in tokens (optional)
    # Limits the number of files analyzed per agent to stay within context window
    max_context_size: 200000
```

## Features

### 1. Incremental Scanning

**How it works:**
- Tracks the git commit hash of the last successful scan
- On subsequent runs, uses `git diff` to identify changed files
- Only analyzes changed files, dramatically reducing analysis time and cost

**Benefits:**
- **50-90% cost reduction** for incremental changes
- **Faster scans** when only a few files changed
- Automatic fallback to full scan if previous commit not found

**Example:**
```bash
# First run (full scan)
./shannon start URL=https://app.com REPO=my-repo
# Takes 1.5 hours, costs ~$50

# Second run after small changes (incremental scan)
./shannon start URL=https://app.com REPO=my-repo
# Takes 15 minutes, costs ~$5 (only changed files analyzed)
```

**Requirements:**
- Target repository must be a git repository
- Previous scan must have completed successfully

### 2. Smart Context Window Management

**How it works:**
- Analyzes file names and paths to identify security-critical files
- Prioritizes files containing:
  - Authentication logic (`auth`, `login`, `session`)
  - Input handling (`validate`, `sanitize`, `parse`)
  - Database access (`query`, `sql`, `orm`)
  - File operations (`upload`, `download`, `read`)
  - Command execution (`exec`, `system`, `shell`)

**Benefits:**
- **Better vulnerability detection** by focusing on high-risk code first
- **Reduced context window usage** by deprioritizing test files and documentation
- **Faster analysis** of critical paths

**Priority Levels:**
- **High (70+)**: Authentication, input handling, database access
- **Medium (40-69)**: General application code
- **Low (<40)**: Tests, documentation, build files

### 3. Caching

**How it works:**
- Computes SHA-256 hash of each file's contents
- Caches analysis results keyed by file path + agent name + file hash
- On subsequent runs, checks cache before analyzing
- Automatically invalidates cache when files change

**Benefits:**
- **Eliminates redundant LLM calls** for unchanged files
- **Instant results** for cached files
- **Automatic invalidation** ensures accuracy

**Cache Location:**
- Stored in `{workspace}/.shannon-cache/`
- Automatically cleaned up on workspace deletion

**Cache Statistics:**
The system tracks cache performance:
- Hit rate (percentage of cache hits)
- Total cache size
- Number of invalidations

### 4. Model Tier Optimization

**How it works:**
- Analyzes task complexity and context size
- Selects appropriate model tier:
  - **Small (Haiku)**: Simple tasks, small contexts, summarization
  - **Medium (Sonnet)**: Standard analysis, tool use
  - **Large (Opus)**: Complex reasoning, deep analysis

**Benefits:**
- **Cost reduction**: Use cheaper models when appropriate
- **Faster execution**: Smaller models are faster
- **Quality maintained**: Complex tasks still use powerful models

**Model Selection Logic:**
- Context < 10K tokens → Small model
- Context > 200K tokens → Medium/Large model
- Simple agents (pre-recon) → Small model
- Complex agents (exploit) → Medium/Large model

### 5. Parallel Agent Optimization

**How it works:**
- Better resource allocation across parallel agents
- Prevents context window exhaustion
- Optimizes concurrent LLM API calls

**Benefits:**
- **Faster overall execution** through better parallelism
- **Reduced API rate limit issues**
- **More efficient resource usage**

## Performance Impact

### Expected Improvements

| Scenario | Time Reduction | Cost Reduction |
|----------|---------------|----------------|
| Incremental scan (small changes) | 80-90% | 80-90% |
| Incremental scan (medium changes) | 50-70% | 50-70% |
| Caching enabled (unchanged files) | 30-50% | 30-50% |
| Model optimization | 10-20% | 20-40% |
| Combined optimizations | 60-85% | 60-85% |

### Example Scenarios

**Scenario 1: Small Bug Fix**
- Changed files: 3
- Total files: 500
- **Without optimization**: 1.5 hours, $50
- **With incremental scan**: 15 minutes, $5
- **Savings**: 83% time, 90% cost

**Scenario 2: Regular Development**
- Changed files: 20
- Total files: 500
- **Without optimization**: 1.5 hours, $50
- **With incremental scan**: 30 minutes, $12
- **Savings**: 67% time, 76% cost

**Scenario 3: Full Scan with Caching**
- All files analyzed
- 30% files unchanged from previous run
- **Without caching**: 1.5 hours, $50
- **With caching**: 1 hour, $35
- **Savings**: 33% time, 30% cost

## Best Practices

1. **Enable all optimizations** for maximum benefit
2. **Use incremental scanning** for regular development workflows
3. **Run full scans periodically** (weekly/monthly) to catch edge cases
4. **Monitor cache hit rates** to ensure caching is effective
5. **Adjust max_context_size** if you hit context window limits

## Troubleshooting

### Incremental Scan Not Working

**Problem**: Full scan runs even with incremental scan enabled

**Solutions**:
- Ensure repository is a git repository
- Check that previous scan completed successfully
- Verify `.last-scan-commit` file exists in workspace

### Cache Not Effective

**Problem**: Low cache hit rate

**Solutions**:
- Check that files aren't changing unnecessarily
- Verify cache directory has write permissions
- Clear cache and rebuild: `rm -rf {workspace}/.shannon-cache/`

### Context Window Exceeded

**Problem**: Errors about context window limits

**Solutions**:
- Reduce `max_context_size` in config
- Enable context prioritization (already prioritizes high-risk files)
- Use incremental scanning to reduce file count

## Disabling Optimizations

To disable specific optimizations, set them to `false` in your config:

```yaml
pipeline:
  optimization:
    enable_incremental_scan: false
    enable_caching: false
    enable_context_prioritization: false
    enable_model_optimization: false
```

Or omit the `optimization` section entirely to use defaults (all enabled).

## Future Enhancements

Planned improvements:
- **Dependency-aware scanning**: Analyze files that depend on changed files
- **Smart batching**: Group related files for more efficient analysis
- **Predictive caching**: Pre-cache likely-to-change files
- **Cost estimation**: Show estimated cost before running scan
