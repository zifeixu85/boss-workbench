import { createContext, useContext } from 'react'

export type NavMode = 'simple' | 'complex' | 'top'
export const NavModeContext = createContext<NavMode>('complex')
export const useNavMode = () => useContext(NavModeContext)
