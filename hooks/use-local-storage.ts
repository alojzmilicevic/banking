import { useCallback, useRef, useSyncExternalStore } from 'react'

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
  const storage =
    typeof window !== 'undefined'
      ? type === 'local'
        ? window.localStorage
        : window.sessionStorage
      : undefined

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
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
    },
    [storage, key, type],
  )

  const snapshotRef = useRef<T>(initialValue)
  const getSnapshot = useCallback((): T => {
    const currentValue = extractValue(key, initialValue, storage!)
    const currentJson = JSON.stringify(currentValue)
    const cachedJson = JSON.stringify(snapshotRef.current)

    if (currentJson !== cachedJson) {
      snapshotRef.current = currentValue
    }

    return snapshotRef.current
  }, [storage, key, initialValue])

  const getServerSnapshot = useCallback((): T => {
    return initialValue
  }, [initialValue])

  const storedValue = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  const initialJson = JSON.stringify(initialValue)
  const setValue = useCallback(
    (param: T | ((previousValue: T) => T)) => {
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
    },
    [storage, key, type, getSnapshot, initialJson],
  )

  return [storedValue, setValue] as const
}

function isSetValueCallback<T>(
  thing: T | ((previousValue: T) => T),
): thing is (previousValue: T) => T {
  return typeof thing === 'function'
}

function extractValue<T>(key: string, initialValue: T, storage: Storage): T {
  try {
    const item = storage.getItem(key)

    if (item !== null) {
      return JSON.parse(item)
    }
  } catch {}
  return initialValue
}
