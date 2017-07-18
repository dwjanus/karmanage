import React from 'react'
import { Link } from 'react-router'

export default class Layout extends React.Component {
  render () {
    return (
      <div className="app-container">
        <header>
          <Link to="/">
            <img className="logo" src="public/images/karma_icon_1.png" />
          </Link>
        </header>
        <div className="app-content">{ this.props.children }</div>
        <footer>
          <p>This is where the footer goes</p>
        </footer>
      </div>
    )
  }
}
