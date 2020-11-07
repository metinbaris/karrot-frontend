import {
  computed,
  markRaw,
  reactive,
  ref,
  toRefs,
  unref,
  watch,
} from '@vue/composition-api'
import deepEqual from 'deep-equal'
import { indexById } from '@/utils/datastore/helpers'
import { createStatus, withStatus } from '@/activities/data/actionStatus'
import { onCacheMounted } from '@/activities/data/useCached'

export function useCollection (params, fetcher) {
  // state

  const entries = ref({})
  const status = reactive(createStatus())

  // getters

  const collection = computed(() => Object.keys(entries.value).map(id => entries.value[id]))

  // helpers

  function getById (id) {
    return Boolean(entries.value[id])
  }

  // run the fetcher when params change

  // hmm, I think this kind of watcher will be re-run if the param values are the same... maybe it's ok, but not pefect!
  // OR does it do special handling when given an object to check each value? well, I guess it should only re-run when the watchers
  // are triggers anyway...
  watch(() => toPlainObject(params), (value, oldValue, onInvalidate) => {
    let valid = true
    withStatus(status, () => fetcher(value, { isValid: () => valid }))
    onInvalidate(() => {
      valid = false
      reset()
    })
  }, { immediate: true })

  onCacheMounted(() => {
    refreshIfStale()
  })

  function checkValid (fn) {
    const initialValue = fn()
    const isValid = () => deepEqual(initialValue, fn())
    isValid.value = initialValue
    return isValid
  }

  // actions

  // just a play/example really...
  const STALE_MS = 10 * 1000
  function refreshIfStale () {
    if (status.finishedAt && !status.pending) {
      const now = new Date().getTime()
      const age = now - status.finishedAt
      if (age > STALE_MS) {
        console.log(`data is more than ${STALE_MS}ms (${age}ms) old! refreshing`)
        const isValid = checkValid(() => toPlainObject(params))
        fetcher(isValid.value, { isValid }).then(() => {
          status.finishedAt = new Date().getTime()
        }).catch(error => {
          // don't do much with errors, it's only background stuff...
          console.log('error with background refresh', error)
        })
      }
    }
  }

  // utilities

  function update (items) {
    entries.value = { ...unref(entries), ...indexById(items.map(markRaw)) }
  }

  function reset () {
    entries.value = {}
    Object.assign(status, createStatus())
  }

  return {
    // getters
    collection,
    status: toRefs(status),

    // helpers
    getById,

    // methods
    update,
  }
}

// only one level...
// params is expected to be an object of either plain values, or refs, such that unref() works on them
export function toPlainObject (params) {
  const obj = {}
  for (const key of Object.keys(params)) {
    obj[key] = unref(params[key])
  }
  return obj
}