import { useEffect, useState } from 'react'

export default function useSessionStorageState(key, initialValue, validValues) {
	const [value, setValue] = useState(() => {
		try {
			const storedValue = window.sessionStorage.getItem(key)
			return validValues.includes(storedValue) ? storedValue : initialValue
		} catch (error) {
			console.error(`Unable to read the saved dashboard selection for "${key}".`, error)
			return initialValue
		}
	})

	useEffect(() => {
		try {
			window.sessionStorage.setItem(key, value)
		} catch (error) {
			console.error(`Unable to save the dashboard selection for "${key}".`, error)
		}
	}, [key, value])

	return [value, setValue]
}
