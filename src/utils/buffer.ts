export class RingBuffer {
	private buffer: string[]
	private head: number = 0
	private tail: number = 0
	private _size: number = 0

	constructor(private capacity: number = 1024) {
		this.buffer = new Array<string>(capacity)
	}

	push(item: string): void {
		this.buffer[this.tail] = item
		this.tail = (this.tail + 1) % this.capacity
		if (this._size === this.capacity) {
			this.head = (this.head + 1) % this.capacity
		} else {
			this._size++
		}
	}

	shift(): string | undefined {
		if (this._size === 0) return undefined
		const item = this.buffer[this.head]
		this.head = (this.head + 1) % this.capacity
		this._size--
		return item
	}

	peek(): string | undefined {
		if (this._size === 0) return undefined
		return this.buffer[this.head]
	}

	get size(): number {
		return this._size
	}

	isEmpty(): boolean {
		return this._size === 0
	}

	clear(): void {
		this.head = 0
		this.tail = 0
		this._size = 0
	}

	toArray(): string[] {
		const result: string[] = []
		let idx = this.head
		for (let i = 0; i < this._size; i++) {
			result.push(this.buffer[idx])
			idx = (idx + 1) % this.capacity
		}
		return result
	}
}

const MAX_STRING_BUFFER_SIZE = 1024 * 1024

export class StringBuffer {
	private chunks: string[] = []
	private _length: number = 0

	append(str: string): void {
		if (str.length === 0) return
		this.chunks.push(str)
		this._length += str.length
		if (this._length > MAX_STRING_BUFFER_SIZE) {
			this.compact()
		}
	}

	private compact(): void {
		if (this.chunks.length <= 1) return
		const merged = this.chunks.join("")
		this.chunks = [merged]
	}

	toString(): string {
		this.compact()
		return this.chunks.join("")
	}

	clear(): void {
		this.chunks = []
		this._length = 0
	}

	get length(): number {
		return this._length
	}
}
