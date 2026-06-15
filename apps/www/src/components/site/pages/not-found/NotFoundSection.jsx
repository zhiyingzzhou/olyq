function NotFoundSection({ content }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center text-center [font-family:system-ui,'Segoe_UI',Roboto,Helvetica,Arial,sans-serif,'Apple_Color_Emoji','Segoe_UI_Emoji']">
      <div>
        <h1 className="next-error-h1 mr-5 inline-block align-top pr-[23px] text-[24px] leading-[49px] font-medium text-black dark:text-white">
          {content.title}
        </h1>
        <div className="inline-block">
          <h2 className="m-0 text-[14px] leading-[49px] font-normal text-black dark:text-white">
            {content.description}
          </h2>
        </div>
      </div>
    </div>
  )
}

export default NotFoundSection
