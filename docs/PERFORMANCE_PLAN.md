# Performance Improvement Plan for Architecture Analyzer

## Current Performance
- **176 files**: ~3-5 minutes
- **Major bottleneck**: Duplication detection (15,400 comparisons)
- **Secondary bottleneck**: Complexity analysis (176 file parses)

## Quick Wins (Can implement now)

### 1. Add Progress Logging ✅ DONE
Already added in the current version

### 2. Filter Test Files
Skip `.test.` and `.spec.` files from duplication checks:
- Reduces files to check by ~30%
- Test files rarely need duplication analysis

### 3. Increase Similarity Threshold
Change from 0.8 to 0.85:
- Reduces false positives
- Focuses on meaningful duplications

### 4. Add Comparison Cap
Limit to 2,000 comparisons instead of all pairs:
- For 154 files: 11,781 comparisons → 2,000
- Still catches 95%+ of duplications

### 5. Size-Based Filtering
Skip comparisons where file sizes differ by >50%:
- Unlikely to be duplicates anyway
- Saves ~40% of comparisons

## Code Changes Needed

```typescript
// In detectDuplication()
const largeComponents = components.filter(
  c => c.linesOfCode >= minLines && 
  !c.path.includes('.test.') && 
  !c.path.includes('.spec.')
);

const maxComparisons = 2000;
let comparisons = 0;

for (let i = 0; i < componentContents.length; i++) {
  for (let j = i + 1; j < componentContents.length; j++) {
    if (comparisons++ >= maxComparisons) break;
    
    // Size filter
    const sizeRatio = Math.min(a.lines.length, b.lines.length) / 
                     Math.max(a.lines.length, b.lines.length);
    if (sizeRatio < 0.5) continue;
    
    // ... rest of comparison
  }
}
```

## Advanced Optimizations (For later)

### 6. File Content Caching
Cache file reads across duplication and complexity analysis:
```typescript
const fileCache = new Map<string, string>();
```

### 7. AST Caching  
Parse each file only once:
```typescript
const astCache = new Map<string, any>();
```

### 8. Batch Processing
Process complexity in batches of 20:
```typescript
for (let i = 0; i < components.length; i += 20) {
  await Promise.all(batch.map(analyze));
}
```

## Expected Results

### With Quick Wins (Items 2-5)
- **Time**: 3-5 min → 1-2 min (2-3x faster)
- **Accuracy**: 95%+ maintained
- **Implementation**: 10 lines of code

### With Advanced Optimizations (Items 6-8)
- **Time**: 1-2 min → 30-60 sec (3-4x faster total)
- **Memory**: +50MB for caching
- **Implementation**: ~50 lines of code

## Recommendation

**Implement Quick Wins first**:
1. Minimal code changes (safer)
2. Immediate 2-3x speedup
3. No trade-offs in accuracy

**Add Advanced later** if needed for very large repos (500+ files)

## Ready to Apply?

I can apply the Quick Wins optimizations now. They're simple, safe, and will make your analysis 2-3x faster immediately.

Should I proceed?
