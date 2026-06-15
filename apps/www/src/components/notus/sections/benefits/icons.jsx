export function BenefitIcon({ type }) {
  if (type === 'rocket') {
    return (
      <svg className="text-brand size-6" fill="none" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg">
        <path d="M4.5 17.0001C3 18.2601 2.5 22.0001 2.5 22.0001C2.5 22.0001 6.24 21.5001 7.5 20.0001C8.21 19.1601 8.2 17.8701 7.41 17.0901C7.02131 16.7191 6.50929 16.5047 5.97223 16.4881C5.43516 16.4715 4.91088 16.6538 4.5 17.0001Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 15.5L9 12.5C9.53214 11.1194 10.2022 9.79607 11 8.55C12.1652 6.68699 13.7876 5.15305 15.713 4.0941C17.6384 3.03514 19.8027 2.48637 22 2.5C22 5.22 21.22 10 16 13.5C14.7369 14.2987 13.3968 14.9687 12 15.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M9 12.5H4C4 12.5 4.55 9.47002 6 8.50002C7.62 7.42002 11 8.50002 11 8.50002" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 15.5V20.5C12 20.5 15.03 19.95 16 18.5C17.08 16.88 16 13.5 16 13.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    )
  }

  if (type === 'repeat') {
    return (
      <svg className="text-brand size-6" fill="none" viewBox="0 0 16 17" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 8.5C14 6.9087 13.3679 5.38258 12.2426 4.25736C11.1174 3.13214 9.5913 2.5 8 2.5C6.32263 2.50631 4.71265 3.16082 3.50667 4.32667L2 5.83333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        <path d="M2 2.5V5.83333H5.33333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        <path d="M2 8.5C2 10.0913 2.63214 11.6174 3.75736 12.7426C4.88258 13.8679 6.4087 14.5 8 14.5C9.67737 14.4937 11.2874 13.8392 12.4933 12.6733L14 11.1667" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        <path d="M10.6667 11.1667H14.0001V14.5001" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
      </svg>
    )
  }

  if (type === 'chart') {
    return (
      <svg className="text-brand size-6" fill="none" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg">
        <path d="M13.3333 17.5V9.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M18.3333 17.5V5.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M3.33325 3.5V19.5C3.33325 20.0304 3.54397 20.5391 3.91904 20.9142C4.29411 21.2893 4.80282 21.5 5.33325 21.5H21.3333" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M8.33325 17.5V14.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    )
  }

  if (type === 'network') {
    return (
      <svg className="text-brand size-6" fill="none" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg">
        <path d="M12.0001 5.50005C12.0013 5.10008 11.9224 4.70391 11.7683 4.33485C11.6141 3.96579 11.3877 3.63128 11.1023 3.351C10.817 3.07072 10.4785 2.85032 10.1067 2.70278C9.73497 2.55524 9.33745 2.48353 8.93757 2.49186C8.53769 2.5002 8.14351 2.58841 7.77821 2.75132C7.41292 2.91422 7.08389 3.14853 6.81048 3.44045C6.53706 3.73238 6.32478 4.07604 6.18613 4.4512C6.04747 4.82637 5.98523 5.22548 6.00307 5.62505C5.41528 5.77619 4.86958 6.0591 4.40731 6.45236C3.94503 6.84562 3.57831 7.33892 3.33492 7.8949C3.09152 8.45087 2.97783 9.05494 3.00246 9.66136C3.02709 10.2678 3.18939 10.8606 3.47707 11.3951C2.97125 11.806 2.5735 12.3343 2.31841 12.934C2.06333 13.5337 1.95863 14.1866 2.01344 14.836C2.06824 15.4854 2.28089 16.1116 2.63288 16.6601C2.98487 17.2085 3.46554 17.6627 4.03307 17.9831C3.96299 18.5253 4.00481 19.0761 4.15596 19.6016C4.30711 20.127 4.56437 20.6159 4.91186 21.038C5.25935 21.4601 5.68968 21.8065 6.17629 22.0558C6.6629 22.3051 7.19545 22.452 7.74105 22.4874C8.28665 22.5228 8.83372 22.446 9.34846 22.2617C9.86321 22.0774 10.3347 21.7895 10.7338 21.4158C11.133 21.0421 11.4512 20.5906 11.669 20.0891C11.8868 19.5876 11.9995 19.0468 12.0001 18.5V5.50005Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M9 13.5C9.83956 13.2047 10.5727 12.667 11.1067 11.955C11.6407 11.243 11.9515 10.3887 12 9.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M6.00293 5.625C6.0227 6.10873 6.15926 6.5805 6.40093 7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M3.47705 11.396C3.65999 11.247 3.85575 11.1145 4.06205 11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M5.99996 18.4999C5.31079 18.5002 4.63323 18.3225 4.03296 17.9839" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 13.5H16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 18.5H18C18.5304 18.5 19.0391 18.7107 19.4142 19.0858C19.7893 19.4609 20 19.9696 20 20.5V21.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M12 8.5H20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M16 8.5V5.5C16 4.96957 16.2107 4.46086 16.5858 4.08579C16.9609 3.71071 17.4696 3.5 18 3.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M16 14C16.2761 14 16.5 13.7761 16.5 13.5C16.5 13.2239 16.2761 13 16 13C15.7239 13 15.5 13.2239 15.5 13.5C15.5 13.7761 15.7239 14 16 14Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M18 4C18.2761 4 18.5 3.77614 18.5 3.5C18.5 3.22386 18.2761 3 18 3C17.7239 3 17.5 3.22386 17.5 3.5C17.5 3.77614 17.7239 4 18 4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M20 22C20.2761 22 20.5 21.7761 20.5 21.5C20.5 21.2239 20.2761 21 20 21C19.7239 21 19.5 21.2239 19.5 21.5C19.5 21.7761 19.7239 22 20 22Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M20 9C20.2761 9 20.5 8.77614 20.5 8.5C20.5 8.22386 20.2761 8 20 8C19.7239 8 19.5 8.22386 19.5 8.5C19.5 8.77614 19.7239 9 20 9Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    )
  }

  if (type === 'shield') {
    return (
      <svg className="text-brand size-6" fill="none" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 3.5L19 6.5V12.5C19 16.5 16.2 20.1 12 21.5C7.8 20.1 5 16.5 5 12.5V6.5L12 3.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
        <path d="M9.5 12.5L11 14L14.5 10.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </svg>
    )
  }

  return (
    <svg className="text-brand size-6" fill="none" viewBox="0 0 24 25" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 17.5V21.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M14.3047 8.02995L15.2277 7.64795" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M15.2277 5.35224L14.3047 4.96924" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M16.8517 3.7282L16.4688 2.8042" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M16.8517 9.27197L16.4688 10.195" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M19.1484 3.7282L19.5314 2.8042" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M19.5304 10.196L19.1484 9.27197" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M20.7725 5.35224L21.6965 4.96924" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M20.7725 7.64795L21.6965 8.03095" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M22 13.5V15.5C22 16.0304 21.7893 16.5391 21.4142 16.9142C21.0391 17.2893 20.5304 17.5 20 17.5H4C3.46957 17.5 2.96086 17.2893 2.58579 16.9142C2.21071 16.5391 2 16.0304 2 15.5V5.5C2 4.96957 2.21071 4.46086 2.58579 4.08579C2.96086 3.71071 3.46957 3.5 4 3.5H11" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M8 21.5H16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M18 9.5C19.6569 9.5 21 8.15685 21 6.5C21 4.84315 19.6569 3.5 18 3.5C16.3431 3.5 15 4.84315 15 6.5C15 8.15685 16.3431 9.5 18 9.5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}
