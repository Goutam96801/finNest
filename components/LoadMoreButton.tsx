import Loading from '@/components/Loading'
import Typo from '@/components/Typo'
import React from 'react'
import { TouchableOpacity } from 'react-native'

type LoadMoreButtonProps = {
  loading: boolean
  onPress: () => void
}

const LoadMoreButton = ({ loading, onPress }: LoadMoreButtonProps) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={loading}
    activeOpacity={0.85}
    className="mt-2 items-center justify-center rounded-2xl border border-[#404040] bg-[#171717] py-3.5"
  >
    {loading ? (
      <Loading size="small" fill={false} />
    ) : (
      <Typo fontWeight="600" color="#a3e635">
        Load more
      </Typo>
    )}
  </TouchableOpacity>
)

export default LoadMoreButton
