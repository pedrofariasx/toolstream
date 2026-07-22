import type { ConfidenceScore, ConfidenceFactor, PendingToolCall } from './types.js'

export interface ConfidenceOptions {
  threshold?: number
  requiredName?: boolean
  requiredId?: boolean
  minArgumentKeys?: number
  maxUnknownRatio?: number
}

const DEFAULT_OPTIONS: Required<ConfidenceOptions> = {
  threshold: 0.7,
  requiredName: true,
  requiredId: false,
  minArgumentKeys: 0,
  maxUnknownRatio: 0.5,
}

export class ConfidenceScorer {
  private options: Required<ConfidenceOptions>

  constructor(options: ConfidenceOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  evaluate(pending: PendingToolCall): ConfidenceScore {
    const factors: ConfidenceFactor[] = []

    factors.push(this.factorNamePresence(pending))
    factors.push(this.factorIdPresence(pending))
    factors.push(this.factorArgumentCompleteness(pending))
    factors.push(this.factorArgumentStructure(pending))
    factors.push(this.factorJsonValidity(pending))
    factors.push(this.factorBufferSize(pending))

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0)
    const weightedScore = factors.reduce((sum, f) => sum + f.weight * f.value, 0)
    const score = totalWeight > 0 ? weightedScore / totalWeight : 0

    const executable = score >= this.options.threshold &&
      (!this.options.requiredName || !!pending.name) &&
      (!this.options.requiredId || !!pending.id)

    return {
      score,
      factors,
      threshold: this.options.threshold,
      executable,
    }
  }

  private factorNamePresence(pending: PendingToolCall): ConfidenceFactor {
    const has = !!pending.name
    return {
      name: 'name-presence',
      weight: 0.3,
      value: has ? 1.0 : 0.0,
      description: has ? `Tool name "${pending.name}" is present` : 'Tool name is missing',
    }
  }

  private factorIdPresence(pending: PendingToolCall): ConfidenceFactor {
    const has = !!pending.id
    return {
      name: 'id-presence',
      weight: 0.1,
      value: has ? 1.0 : 0.5,
      description: has ? `Tool ID "${pending.id}" is present` : 'Tool ID is missing',
    }
  }

  private factorArgumentCompleteness(pending: PendingToolCall): ConfidenceFactor {
    const args = pending.arguments
    if (!args || args.length === 0) {
      return {
        name: 'argument-completeness',
        weight: 0.25,
        value: 0.0,
        description: 'No arguments received yet',
      }
    }

    const openBraces = (args.match(/\{/g) || []).length
    const closeBraces = (args.match(/\}/g) || []).length
    const openBrackets = (args.match(/\[/g) || []).length
    const closeBrackets = (args.match(/\]/g) || []).length

    const balancedBraces = openBraces === closeBraces
    const balancedBrackets = openBrackets === closeBrackets

    let completeness = 0.5
    if (balancedBraces && balancedBrackets) {
      completeness = 1.0
    } else if (balancedBraces) {
      completeness = 0.7
    }

    return {
      name: 'argument-completeness',
      weight: 0.25,
      value: completeness,
      description: `Braces: ${balancedBraces ? 'balanced' : 'unbalanced'}, Brackets: ${balancedBrackets ? 'balanced' : 'unbalanced'}`,
    }
  }

  private factorArgumentStructure(pending: PendingToolCall): ConfidenceFactor {
    const args = pending.arguments
    if (!args || args.length < 3) {
      return {
        name: 'argument-structure',
        weight: 0.15,
        value: 0.0,
        description: 'Arguments too short to evaluate structure',
      }
    }

    const hasObjectStart = args.trimStart().startsWith('{')
    const hasValidPairs = /"[^"]+"\s*:/.test(args)
    const hasCommas = args.includes(',')

    let quality = 0.0
    if (hasObjectStart) quality += 0.4
    if (hasValidPairs) quality += 0.3
    if (hasCommas) quality += 0.3

    return {
      name: 'argument-structure',
      weight: 0.15,
      value: Math.min(1.0, quality),
      description: `Object start: ${hasObjectStart}, Key-value pairs: ${hasValidPairs}, Commas: ${hasCommas}`,
    }
  }

  private factorJsonValidity(pending: PendingToolCall): ConfidenceFactor {
    const args = pending.arguments
    if (!args || args.length === 0) {
      return {
        name: 'json-validity',
        weight: 0.15,
        value: 0.0,
        description: 'No JSON to evaluate',
      }
    }

    try {
      JSON.parse(args)
      return {
        name: 'json-validity',
        weight: 0.15,
        value: 1.0,
        description: 'Arguments form valid JSON',
      }
    } catch {
      return {
        name: 'json-validity',
        weight: 0.15,
        value: 0.3,
        description: 'Partial JSON (expected in streaming)',
      }
    }
  }

  private factorBufferSize(pending: PendingToolCall): ConfidenceFactor {
    const len = pending.arguments.length
    if (len < 10) {
      return {
        name: 'buffer-size',
        weight: 0.05,
        value: 0.0,
        description: 'Very small buffer',
      }
    }
    if (len < 50) {
      return {
        name: 'buffer-size',
        weight: 0.05,
        value: 0.3,
        description: 'Small buffer',
      }
    }
    if (len < 200) {
      return {
        name: 'buffer-size',
        weight: 0.05,
        value: 0.6,
        description: 'Medium buffer',
      }
    }
    return {
      name: 'buffer-size',
      weight: 0.05,
      value: 1.0,
      description: 'Large buffer',
    }
  }
}
