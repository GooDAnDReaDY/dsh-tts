import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import {
  addStreamSubscriber,
  broadcastStream,
  clearStreamSubscribers,
  removeStreamSubscriber,
  streamSubscriberCount,
} from '../lib/stream-hub.js'

function fakeRes() {
  const ee = new EventEmitter()
  const writes = []
  ee.write = (p) => { writes.push(p); return true }
  ee.end = () => { ee.ended = true }
  ee.writes = writes
  return ee
}

test('hub add, broadcast, remove', () => {
  clearStreamSubscribers()
  const res = fakeRes()
  addStreamSubscriber(res)
  assert.equal(streamSubscriberCount(), 1)
  broadcastStream('utterance', { id: 'u1' })
  assert.equal(res.writes.length, 1)
  assert.match(res.writes[0], /event: utterance/)
  assert.match(res.writes[0], /u1/)
  removeStreamSubscriber(res)
  assert.equal(streamSubscriberCount(), 0)
  clearStreamSubscribers()
})

test('hub drops subscriber on socket close', () => {
  clearStreamSubscribers()
  const res = fakeRes()
  addStreamSubscriber(res)
  res.emit('close')
  assert.equal(streamSubscriberCount(), 0)
  clearStreamSubscribers()
})

test('broadcast prunes write failures', () => {
  clearStreamSubscribers()
  const bad = fakeRes()
  bad.write = () => { throw new Error('EPIPE') }
  const good = fakeRes()
  addStreamSubscriber(bad)
  addStreamSubscriber(good)
  broadcastStream('chime', { id: 'c1' })
  assert.equal(streamSubscriberCount(), 1)
  assert.equal(good.writes.length, 1)
  clearStreamSubscribers()
})