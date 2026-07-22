import { describe, it, expect } from 'vitest'
import { RingBuffer, StringBuffer } from '../src/utils/buffer.js'

describe('RingBuffer', () => {
  it('should push and shift items', () => {
    const buf = new RingBuffer(5)
    buf.push('a')
    buf.push('b')
    buf.push('c')

    expect(buf.shift()).toBe('a')
    expect(buf.shift()).toBe('b')
    expect(buf.shift()).toBe('c')
    expect(buf.shift()).toBeUndefined()
  })

  it('should peek without removing', () => {
    const buf = new RingBuffer(5)
    buf.push('hello')

    expect(buf.peek()).toBe('hello')
    expect(buf.size).toBe(1)
  })

  it('should handle overflow correctly', () => {
    const buf = new RingBuffer(3)
    buf.push('a')
    buf.push('b')
    buf.push('c')
    buf.push('d')

    expect(buf.size).toBe(3)
    expect(buf.shift()).toBe('b')
    expect(buf.shift()).toBe('c')
    expect(buf.shift()).toBe('d')
  })

  it('should report empty correctly', () => {
    const buf = new RingBuffer(3)
    expect(buf.isEmpty()).toBe(true)
    expect(buf.size).toBe(0)

    buf.push('test')
    expect(buf.isEmpty()).toBe(false)
    expect(buf.size).toBe(1)
  })

  it('should clear all items', () => {
    const buf = new RingBuffer(5)
    buf.push('a')
    buf.push('b')
    buf.clear()

    expect(buf.isEmpty()).toBe(true)
    expect(buf.shift()).toBeUndefined()
  })

  it('should convert to array', () => {
    const buf = new RingBuffer(5)
    buf.push('x')
    buf.push('y')
    buf.push('z')

    expect(buf.toArray()).toEqual(['x', 'y', 'z'])
  })
})

describe('StringBuffer', () => {
  it('should append and convert to string', () => {
    const buf = new StringBuffer()
    buf.append('hello')
    buf.append(' ')
    buf.append('world')

    expect(buf.toString()).toBe('hello world')
  })

  it('should track length', () => {
    const buf = new StringBuffer()
    expect(buf.length).toBe(0)

    buf.append('hello')
    expect(buf.length).toBe(5)

    buf.append(' world')
    expect(buf.length).toBe(11)
  })

  it('should clear contents', () => {
    const buf = new StringBuffer()
    buf.append('data')
    buf.clear()

    expect(buf.length).toBe(0)
    expect(buf.toString()).toBe('')
  })

  it('should handle empty append gracefully', () => {
    const buf = new StringBuffer()
    buf.append('')
    expect(buf.length).toBe(0)
    expect(buf.toString()).toBe('')
  })
})
