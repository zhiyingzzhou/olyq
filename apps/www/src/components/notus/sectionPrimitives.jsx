import { useId } from 'react'
import { motion } from 'framer-motion'
import { getStatusChipClassName } from './statusChipStyles.js'
import { joinClassNames } from './utils.js'

export function BrowserHeaderIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      height="15"
      viewBox="0 0 14 15"
      width="14"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.6665 2.7915H2.33317C1.68884 2.7915 1.1665 3.31384 1.1665 3.95817V10.9582C1.1665 11.6025 1.68884 12.1248 2.33317 12.1248H11.6665C12.3108 12.1248 12.8332 11.6025 12.8332 10.9582V3.95817C12.8332 3.31384 12.3108 2.7915 11.6665 2.7915Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.16667"
      />
      <path d="M3.5 5.125H3.50583" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.16667" />
      <path d="M5.8335 5.125H5.83933" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.16667" />
      <path d="M8.1665 5.125H8.17234" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.16667" />
    </svg>
  )
}

export function WorkflowTabIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      height="17"
      viewBox="0 0 16 17"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8.02287 8.95395C7.99883 8.89366 7.993 8.82765 8.00609 8.76407C8.01918 8.7005 8.05061 8.64216 8.09651 8.59626C8.1424 8.55037 8.20075 8.51893 8.26432 8.50584C8.32789 8.49276 8.39391 8.49859 8.4542 8.52262L14.4542 10.856C14.5185 10.8811 14.5735 10.9256 14.6114 10.9833C14.6493 11.041 14.6684 11.1091 14.666 11.1781C14.6636 11.2471 14.6398 11.3137 14.5979 11.3686C14.556 11.4235 14.4981 11.464 14.4322 11.4846L12.1362 12.1966C12.0326 12.2286 11.9384 12.2855 11.8617 12.3621C11.785 12.4388 11.7282 12.533 11.6962 12.6366L10.9849 14.932C10.9643 14.9979 10.9237 15.0558 10.8688 15.0977C10.8139 15.1396 10.7474 15.1634 10.6783 15.1658C10.6093 15.1682 10.5412 15.1491 10.4835 15.1112C10.4258 15.0732 10.3813 15.0183 10.3562 14.954L8.02287 8.95395Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M14 7.83333V3.83333C14 3.47971 13.8595 3.14057 13.6095 2.89052C13.3594 2.64048 13.0203 2.5 12.6667 2.5H3.33333C2.97971 2.5 2.64057 2.64048 2.39052 2.89052C2.14048 3.14057 2 3.47971 2 3.83333V13.1667C2 13.5203 2.14048 13.8594 2.39052 14.1095C2.64057 14.3595 2.97971 14.5 3.33333 14.5H7.33333"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  )
}

export function ToolsTabIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      height="17"
      viewBox="0 0 16 17"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M8 12.5V3.83337"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M10 9.16667C9.4232 8.99806 8.91656 8.64708 8.556 8.16633C8.19544 7.68558 8.00036 7.10094 8 6.5C7.99964 7.10094 7.80456 7.68558 7.444 8.16633C7.08344 8.64708 6.5768 8.99806 6 9.16667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M11.732 4.83322C11.8854 4.56754 11.9756 4.27014 11.9957 3.96401C12.0158 3.65789 11.9652 3.35125 11.8478 3.06781C11.7304 2.78438 11.5494 2.53175 11.3187 2.32947C11.0881 2.12719 10.814 1.98068 10.5176 1.90128C10.2213 1.82188 9.91069 1.81171 9.6098 1.87156C9.30891 1.93142 9.02583 2.05969 8.78244 2.24645C8.53906 2.43321 8.3419 2.67346 8.20623 2.94861C8.07055 3.22376 7.99999 3.52643 8 3.83322C8.00001 3.52643 7.92945 3.22376 7.79377 2.94861C7.6581 2.67346 7.46094 2.43321 7.21756 2.24645C6.97417 2.05969 6.69109 1.93142 6.3902 1.87156C6.08931 1.81171 5.77868 1.82188 5.48236 1.90128C5.18603 1.98068 4.91193 2.12719 4.68129 2.32947C4.45064 2.53175 4.26961 2.78438 4.15222 3.06781C4.03483 3.35125 3.98421 3.65789 4.00429 3.96401C4.02436 4.27014 4.11459 4.56754 4.268 4.83322"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M11.998 3.91663C12.3899 4.01738 12.7537 4.20599 13.0619 4.46817C13.3701 4.73034 13.6146 5.05921 13.7768 5.42986C13.9391 5.80051 14.0149 6.20322 13.9985 6.6075C13.982 7.01178 13.8738 7.40702 13.682 7.76329"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M12 12.4999C12.587 12.4999 13.1576 12.3062 13.6233 11.9488C14.089 11.5915 14.4238 11.0905 14.5757 10.5235C14.7276 9.95645 14.6882 9.35516 14.4636 8.81284C14.239 8.27051 13.8417 7.81745 13.3333 7.52393"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M13.3114 12.1553C13.3581 12.5168 13.3303 12.884 13.2295 13.2343C13.1287 13.5846 12.9572 13.9105 12.7256 14.1919C12.4939 14.4733 12.207 14.7043 11.8826 14.8704C11.5582 15.0366 11.2032 15.1346 10.8394 15.1582C10.4757 15.1818 10.111 15.1306 9.76782 15.0077C9.42466 14.8848 9.11033 14.6929 8.84424 14.4438C8.57815 14.1947 8.36596 13.8937 8.22077 13.5593C8.07558 13.225 8.00047 12.8644 8.00008 12.4999C7.99969 12.8644 7.92458 13.225 7.77939 13.5593C7.6342 13.8937 7.42201 14.1947 7.15592 14.4438C6.88983 14.6929 6.5755 14.8848 6.23234 15.0077C5.88917 15.1306 5.52446 15.1818 5.16073 15.1582C4.797 15.1346 4.44197 15.0366 4.11756 14.8704C3.79315 14.7043 3.50626 14.4733 3.2746 14.1919C3.04294 13.9105 2.87144 13.5846 2.77067 13.2343C2.66991 12.884 2.64202 12.5168 2.68875 12.1553"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M3.9998 12.4999C3.4128 12.4999 2.84221 12.3062 2.37651 11.9488C1.91082 11.5915 1.57605 11.0905 1.42412 10.5235C1.27219 9.95645 1.31159 9.35516 1.53621 8.81284C1.76083 8.27051 2.15812 7.81745 2.66647 7.52393"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M4.00187 3.91663C3.61001 4.01738 3.24621 4.20599 2.93803 4.46817C2.62985 4.73034 2.38536 5.05921 2.2231 5.42986C2.06084 5.80051 1.98504 6.20322 2.00146 6.6075C2.01788 7.01178 2.12608 7.40702 2.31787 7.76329"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  )
}

export function DeployTabIcon({ className = '' }) {
  return (
    <svg
      className={className}
      fill="none"
      height="17"
      viewBox="0 0 16 17"
      width="16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M10.6667 9.16664L14.1487 11.488C14.1989 11.5214 14.2573 11.5405 14.3175 11.5434C14.3777 11.5463 14.4376 11.5328 14.4907 11.5043C14.5439 11.4759 14.5883 11.4335 14.6193 11.3818C14.6503 11.3301 14.6667 11.2709 14.6667 11.2106V5.74664C14.6668 5.68799 14.6513 5.63037 14.6219 5.57961C14.5926 5.52884 14.5503 5.48672 14.4995 5.45751C14.4486 5.42829 14.3909 5.41301 14.3323 5.41321C14.2736 5.41341 14.2161 5.42908 14.1654 5.45864L10.6667 7.49997"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
      <path
        d="M9.33325 4.5H2.66659C1.93021 4.5 1.33325 5.09695 1.33325 5.83333V11.1667C1.33325 11.903 1.93021 12.5 2.66659 12.5H9.33325C10.0696 12.5 10.6666 11.903 10.6666 11.1667V5.83333C10.6666 5.09695 10.0696 4.5 9.33325 4.5Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.33333"
      />
    </svg>
  )
}

export function NotificationBellIcon({ className = '' }) {
  return (
    <svg className={className} fill="none" height="14" viewBox="0 0 14 14" width="14" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M5.98975 12.25C6.09215 12.4273 6.23942 12.5746 6.41677 12.677C6.59412 12.7794 6.7953 12.8333 7.00008 12.8333C7.20486 12.8333 7.40604 12.7794 7.58339 12.677C7.76074 12.5746 7.90801 12.4273 8.01041 12.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.16667"
      />
      <path
        d="M1.9029 8.94C1.82669 9.02353 1.7764 9.12739 1.75814 9.23897C1.73989 9.35055 1.75445 9.46503 1.80006 9.56849C1.84567 9.67194 1.92036 9.75991 2.01504 9.8217C2.10973 9.88348 2.22033 9.91642 2.3334 9.9165H11.6667C11.7798 9.91654 11.8904 9.88373 11.9852 9.82207C12.0799 9.7604 12.1547 9.67252 12.2004 9.56914C12.2461 9.46575 12.2608 9.3513 12.2427 9.23971C12.2246 9.12812 12.1745 9.0242 12.0984 8.94059C11.3226 8.14084 10.5001 7.29092 10.5001 4.6665C10.5001 3.73825 10.1313 2.84801 9.47494 2.19163C8.81856 1.53525 7.92832 1.1665 7.00006 1.1665C6.0718 1.1665 5.18157 1.53525 4.52519 2.19163C3.86881 2.84801 3.50006 3.73825 3.50006 4.6665C3.50006 7.29092 2.67698 8.14084 1.9029 8.94Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.16667"
      />
    </svg>
  )
}

export function DeploymentStatusIcon({ className = '' }) {
  return (
    <svg className={className} fill="none" height="14" viewBox="0 0 14 14" width="14" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.2 11.8609C11.0698 11.8609 11.775 11.1558 11.775 10.2859C11.775 9.41609 11.0698 8.71094 10.2 8.71094C9.33015 8.71094 8.625 9.41609 8.625 10.2859C8.625 11.1558 9.33015 11.8609 10.2 11.8609Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.05" />
      <path d="M3.9002 5.56089C4.77004 5.56089 5.4752 4.85574 5.4752 3.98589C5.4752 3.11604 4.77004 2.41089 3.9002 2.41089C3.03035 2.41089 2.3252 3.11604 2.3252 3.98589C2.3252 4.85574 3.03035 5.56089 3.9002 5.56089Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.05" />
      <path d="M7.5752 3.98608H9.1502C9.42867 3.98608 9.69574 4.09671 9.89266 4.29362C10.0896 4.49053 10.2002 4.75761 10.2002 5.03608V8.71108" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.05" />
      <path d="M6.5249 10.286H4.9499C4.67142 10.286 4.40435 10.1754 4.20744 9.9785C4.01053 9.78158 3.8999 9.51451 3.8999 9.23603V5.56104" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.05" />
    </svg>
  )
}

export function ConnectingLineHorizontal({ className = '' }) {
  const gradientId = useId()

  return (
    <svg className={className} fill="none" height="2" viewBox="0 0 314 2" width="314" xmlns="http://www.w3.org/2000/svg">
      <line stroke="var(--color-line)" strokeLinecap="round" x1="0.5" x2="313.5" y1="1" y2="1" />
      <line stroke={`url(#${gradientId})`} strokeLinecap="round" x1="0.5" x2="313.5" y1="1" y2="1" />
      <defs>
        <motion.linearGradient
          animate={{ x1: '110%', x2: '120%', y1: 0, y2: 1 }}
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          initial={{ x1: '-10%', x2: '0%', y1: 0, y2: 1 }}
          transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, repeatType: 'loop', ease: 'easeInOut' }}
        >
          <stop stopColor="var(--color-line)" />
          <stop offset="0.5" stopColor="var(--color-blue-500)" />
          <stop offset="1" stopColor="var(--color-line)" />
        </motion.linearGradient>
      </defs>
    </svg>
  )
}

export function ConnectingLineVertical({ className = '' }) {
  const gradientId = useId()

  return (
    <svg className={joinClassNames('shrink-0', className)} fill="none" height="81" viewBox="0 0 1 81" width="1" xmlns="http://www.w3.org/2000/svg">
      <line stroke="var(--color-line)" transform="matrix(0 -1 -1 0 0 80.5)" x2="80" y1="-0.5" y2="-0.5" />
      <line stroke={`url(#${gradientId})`} transform="matrix(0 -1 -1 0 0 80.5)" x2="80" y1="-0.5" y2="-0.5" />
      <defs>
        <motion.linearGradient
          animate={{ x1: 0, x2: 2, y1: '80%', y2: '100%' }}
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          initial={{ x1: 0, x2: 2, y1: '0%', y2: '0%' }}
          transition={{ duration: 4, repeat: Infinity, repeatDelay: 1, repeatType: 'loop', ease: 'easeInOut' }}
        >
          <stop stopColor="var(--color-line)" />
          <stop offset="0.5" stopColor="#F17463" />
          <stop offset="1" stopColor="var(--color-line)" />
        </motion.linearGradient>
      </defs>
    </svg>
  )
}

export function StatusChip({ children, tone = 'default', className = '' }) {
  return (
    <div className={getStatusChipClassName({ className, tone })}>{children}</div>
  )
}
