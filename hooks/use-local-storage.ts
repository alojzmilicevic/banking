import { useRef, useSyncExternalStore } from 'react'

const STORAGE_SYNC_EVENT = '__BANKING_STORAGE_SYNC__'

interface StorageSyncDetail {
  key: string
  storageType: 'local' | 'session'
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  return useStorage('local', key, initialValue)
}

export function useSessionStorage<T>(key: string, initialValue: T) {
  return useStorage('session', key, initialValue)
}

function useStorage<T>(
  type: 'local' | 'session',
  key: string,
  initialValue: T,
) {
  const storage = getStorage(type)

  const subscribe = (onStoreChange: () => void) => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.storageArea === storage) {
        onStoreChange()
      }
    }

    const handleSyncEvent = (e: Event) => {
      const customEvent = e as CustomEvent<StorageSyncDetail>
      const { key: eventKey, storageType } = customEvent.detail
      if (eventKey === key && storageType === type) {
        onStoreChange()
      }
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener(STORAGE_SYNC_EVENT, handleSyncEvent)

    return () => {
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener(STORAGE_SYNC_EVENT, handleSyncEvent)
    }
  }

  const lastRawRef = useRef<string | null | undefined>(undefined)
  const valueRef = useRef<T>(initialValue)
  const getSnapshot = (): T => {
    if (!storage) return initialValue
    const raw = storage.getItem(key)
    if (raw === lastRawRef.current) return valueRef.current
    lastRawRef.current = raw
    if (raw === null) {
      valueRef.current = initialValue
    } else {
      try {
        valueRef.current = JSON.parse(raw) as T
      } catch {
        valueRef.current = initialValue
      }
    }
    return valueRef.current
  }

  const getServerSnapshot = (): T => initialValue

  const storedValue = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  const initialJson = JSON.stringify(initialValue)
  const setValue = (param: T | ((previousValue: T) => T)) => {
    try {
      const newValue = isSetValueCallback<T>(param)
        ? param(getSnapshot())
        : param

      const newJson = JSON.stringify(newValue)
      if (newJson === initialJson) {
        storage!.removeItem(key)
      } else {
        storage!.setItem(key, newJson)
      }
      window.dispatchEvent(
        new CustomEvent<StorageSyncDetail>(STORAGE_SYNC_EVENT, {
          detail: { key, storageType: type },
        }),
      )
    } catch (error) {
      console.error(`Failed to set storage key '${key}'`, error)
    }
  }

  return [storedValue, setValue] as const
}

function isSetValueCallback<T>(
  thing: T | ((previousValue: T) => T),
): thing is (previousValue: T) => T {
  return typeof thing === 'function'
}

function getStorage(type: 'local' | 'session') {
  if (typeof window === 'undefined') return undefined
  return type === 'local' ? window.localStorage : window.sessionStorage
}
