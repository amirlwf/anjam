import { useSyncExternalStore } from 'react'
import { store } from './store'

export const useStore = () => useSyncExternalStore(store.subscribe, store.getState)
