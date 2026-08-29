import React from 'react'
import { RefreshControl, type RefreshControlProps } from 'react-native'

const AppRefreshControl = ({
  tintColor = '#a3e635',
  colors = ['#a3e635'],
  progressBackgroundColor = '#262626',
  ...props
}: RefreshControlProps) => (
  <RefreshControl
    {...props}
    tintColor={tintColor}
    colors={colors}
    progressBackgroundColor={progressBackgroundColor}
  />
)

export default AppRefreshControl
